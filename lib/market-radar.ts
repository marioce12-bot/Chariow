import { analyzeMarketRadarWithAI } from "@/lib/market-radar-ai";
import { getMarketRadarCountryName, MARKET_RADAR_COUNTRIES, type MarketRadarCountryCode } from "@/lib/market-radar-countries";
import { scoreMarketTrend, type MarketTrendDirection, type MarketTrendSignal } from "@/lib/market-radar-signals";

export type MarketRadarFormat = "ebook" | "formation" | "template" | "abonnement";

export type MarketRadarInput = {
  idea: string;
  audience: string;
  audiences?: string[];
  format: MarketRadarFormat;
  locale?: "fr" | "en";
};

export type MarketSignalClient = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => any;
};

type TrendSource = "live" | "cache" | "stale" | "unavailable" | "error";
type MarketStatus = "measured" | "partial" | "qualitative" | "ai_unavailable";

export type MarketRadarCountryRecommendation = {
  code: MarketRadarCountryCode;
  name: string;
  score: number | null;
  aiFitScore: number;
  audienceFitScore: number;
  productFitScore: number;
  confidence: "low" | "medium";
  signalStatus: "measured" | "hypothesis";
  source: TrendSource;
  rationale: string;
  firstTest: string;
  trend: {
    currentIndex: number | null;
    previousIndex: number | null;
    direction: MarketTrendDirection;
    points: number[];
    sampleCount: number;
  };
};

export type MarketRadarReport = {
  query: MarketRadarInput;
  status: MarketStatus;
  score: number | null;
  confidence: "low" | "medium";
  summary: string;
  liveSources: string[];
  dimensions: {
    demand: number | null;
    growth: number | null;
    audienceFit: number | null;
    productFit: number | null;
    competition: null;
    monetization: null;
  };
  evidence: Array<{ label: string; value: string }>;
  trend: {
    countryCode: MarketRadarCountryCode | null;
    currentIndex: number | null;
    previousIndex: number | null;
    direction: MarketTrendDirection;
    points: number[];
    summary: string;
  };
  recommendedCountries: MarketRadarCountryRecommendation[];
  ideas: Array<{ title: string; promise: string; audience: string; outline: string[]; upsell: string }>;
  risks: string[];
  methodology: string;
};

const TRENDS_TTL_MS = 7 * 86400000;
const SERPAPI_MONTHLY_LIMIT = 200;
const IDEA_MAX_LENGTH = 180;

export function normalizeMarketQuery(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function mean(values: Array<number | null>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return valid.length ? clamp(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null;
}

function formatCurrencyFreeLabel(status: TrendSource, locale: "fr" | "en") {
  if (locale === "en") {
    return status === "live" ? "live" : status === "cache" ? "cached" : status === "stale" ? "stale cache" : status === "unavailable" ? "unavailable" : "error";
  }
  return status === "live" ? "temps réel" : status === "cache" ? "cache récent" : status === "stale" ? "cache ancien" : status === "unavailable" ? "indisponible" : "erreur";
}

function trendSourceName(sources: TrendSource[], locale: "fr" | "en") {
  const live = sources.filter((source) => source === "live").length;
  const cache = sources.filter((source) => source === "cache").length;
  const stale = sources.filter((source) => source === "stale").length;
  const parts = [
    live ? `${live} ${formatCurrencyFreeLabel("live", locale)}` : "",
    cache ? `${cache} ${formatCurrencyFreeLabel("cache", locale)}` : "",
    stale ? `${stale} ${formatCurrencyFreeLabel("stale", locale)}` : "",
  ].filter(Boolean);
  return locale === "en"
    ? `Google Trends via SerpApi (${parts.length ? parts.join(", ") : "no usable series"})`
    : `Google Trends via SerpApi (${parts.length ? parts.join(", ") : "aucune série exploitable"})`;
}

async function fetchGoogleTrends(idea: string, country: MarketRadarCountryCode) {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key) return null;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_trends");
  url.searchParams.set("q", idea);
  url.searchParams.set("geo", country);
  url.searchParams.set("data_type", "TIMESERIES");
  url.searchParams.set("date", "today 12-m");
  url.searchParams.set("api_key", key);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Google Trends request failed (${response.status})`);
  return await response.json() as Record<string, unknown>;
}

export async function fetchCachedTrends(supabase: MarketSignalClient, query: string, country: string) {
  const normalized = normalizeMarketQuery(query);
  const cacheKey = `trends:${country}:TIMESERIES:${normalized}`;
  const { data: cached } = await supabase.from("market_signals").select("payload,fetched_at").eq("cache_key", cacheKey).maybeSingle();
  const fetchedAt = typeof cached?.fetched_at === "string" ? new Date(cached.fetched_at).getTime() : Number.NaN;
  const isFresh = Number.isFinite(fetchedAt) && Date.now() - fetchedAt < TRENDS_TTL_MS;
  if (isFresh && cached?.payload && typeof cached.payload === "object") {
    return { payload: cached.payload as Record<string, unknown>, source: "cache" as const };
  }

  if (!process.env.SERPAPI_KEY?.trim()) return { payload: null, source: "unavailable" as const };

  const month = new Date().toISOString().slice(0, 7);
  const { data: usage } = await supabase.from("api_usage").select("count").eq("provider", "serpapi").eq("month", month).maybeSingle();
  if (Number(usage?.count ?? 0) >= SERPAPI_MONTHLY_LIMIT) {
    if (cached?.payload && typeof cached.payload === "object") {
      return { payload: cached.payload as Record<string, unknown>, source: "stale" as const };
    }
    throw new Error("SerpApi monthly quota reached");
  }

  const payload = await fetchGoogleTrends(normalized, country as MarketRadarCountryCode);
  if (!payload) return { payload: null, source: "unavailable" as const };
  await supabase.from("market_signals").upsert({ cache_key: cacheKey, provider: "serpapi", payload, fetched_at: new Date().toISOString() });
  await supabase.rpc("increment_api_usage", { p_provider: "serpapi", p_month: month });
  return { payload, source: "live" as const };
}

function countryScore(signal: MarketTrendSignal, audienceFit: number, productFit: number) {
  if (signal.status !== "available" || signal.interestPercentile === null || signal.momentumScore === null) return null;
  // Search interest and momentum are measured within each country's own Trends series,
  // while fit scores are explicitly AI judgments; the result is a test-priority score.
  return clamp(
    signal.interestPercentile * 0.25
      + signal.momentumScore * 0.25
      + audienceFit * 0.3
      + productFit * 0.2,
  );
}

function localeText(locale: "fr" | "en", fr: string, en: string) {
  return locale === "en" ? en : fr;
}

function fixedRisks(locale: "fr" | "en") {
  return locale === "en" ? [
    "Google Trends is a normalized search-interest index, not search volume, sales, or revenue.",
    "Each country’s index is normalized to its own period; it cannot compare total market size across countries.",
    "Competition and willingness to pay are not measured by the available sources.",
    "Validate the leading ideas with customer conversations or a small landing-page test before producing the full offer.",
  ] : [
    "Google Trends est un indice d’intérêt de recherche normalisé, pas un volume de recherches, des ventes ou du chiffre d’affaires.",
    "L’indice de chaque pays est normalisé sur sa propre période : il ne compare pas la taille totale des marchés entre pays.",
    "La concurrence et la volonté de payer ne sont pas mesurées par les sources disponibles.",
    "Valide les pistes principales par des échanges clients ou une petite page de test avant de produire l’offre complète.",
  ];
}

export async function buildMarketRadar(input: MarketRadarInput, supabase?: MarketSignalClient): Promise<MarketRadarReport> {
  const locale = input.locale === "en" ? "en" : "fr";
  const normalizedInput: MarketRadarInput = {
    idea: input.idea.trim().slice(0, IDEA_MAX_LENGTH),
    audience: input.audience.trim().slice(0, 360),
    audiences: (input.audiences ?? []).map((audience) => audience.trim().slice(0, 80)).filter(Boolean).slice(0, 5),
    format: input.format,
    locale,
  };

  const collected = await Promise.all(MARKET_RADAR_COUNTRIES.map(async (country) => {
    let source: TrendSource = "unavailable";
    let payload: Record<string, unknown> | null = null;
    try {
      if (supabase) {
        const result = await fetchCachedTrends(supabase, normalizedInput.idea, country.code);
        payload = result.payload;
        source = result.source;
      } else {
        payload = await fetchGoogleTrends(normalizedInput.idea, country.code);
        source = payload ? "live" : "unavailable";
      }
    } catch {
      source = "error";
    }
    const signal = scoreMarketTrend(payload);
    return { code: country.code, name: getMarketRadarCountryName(country.code, locale), source, signal };
  }));

  let ai: Awaited<ReturnType<typeof analyzeMarketRadarWithAI>> | null = null;
  try {
    ai = await analyzeMarketRadarWithAI({
      idea: normalizedInput.idea,
      audiences: normalizedInput.audiences?.length ? normalizedInput.audiences : normalizedInput.audience ? [normalizedInput.audience] : [],
      format: normalizedInput.format,
      locale,
      countries: collected.map(({ code, name, source, signal }) => ({
        code,
        name,
        status: signal.status,
        source,
        sampleCount: signal.sampleCount,
        currentIndex: signal.currentIndex,
        previousIndex: signal.previousIndex,
        interestPercentile: signal.interestPercentile,
        momentumScore: signal.momentumScore,
        direction: signal.direction,
        relatedQueries: signal.relatedQueries,
      })),
    });
  } catch {
    ai = null;
  }

  const sourceByCountry = new Map(collected.map((item) => [item.code, item]));
  const recommendations: MarketRadarCountryRecommendation[] = ai?.recommendedCountries.map((country) => {
    const market = sourceByCountry.get(country.code);
    const signal = market?.signal;
    const score = signal ? countryScore(signal, country.audienceFitScore, country.productFitScore) : null;
    const sampleConfidence = signal && signal.status === "available" && signal.sampleCount >= 20 && market?.source !== "stale";
    return {
      code: country.code,
      name: getMarketRadarCountryName(country.code, locale),
      score,
      aiFitScore: clamp(country.audienceFitScore * 0.6 + country.productFitScore * 0.4),
      audienceFitScore: country.audienceFitScore,
      productFitScore: country.productFitScore,
      confidence: sampleConfidence ? "medium" : "low",
      signalStatus: score === null ? "hypothesis" : "measured",
      source: market?.source ?? "unavailable",
      rationale: country.rationale,
      firstTest: country.firstTest,
      trend: {
        currentIndex: signal?.currentIndex ?? null,
        previousIndex: signal?.previousIndex ?? null,
        direction: signal?.direction ?? "unknown",
        points: signal?.points ?? [],
        sampleCount: signal?.sampleCount ?? 0,
      },
    };
  }) ?? [];

  recommendations.sort((left, right) => {
    if (left.score !== null && right.score !== null) return right.score - left.score;
    if (left.score !== null) return -1;
    if (right.score !== null) return 1;
    return right.aiFitScore - left.aiFitScore;
  });

  const scoredRecommendations = recommendations.filter((country) => country.score !== null);
  const availableSignals = collected.filter((country) => country.signal.status === "available");
  const score = mean(scoredRecommendations.map((country) => country.score));
  const dimensions = {
    demand: mean(scoredRecommendations.map((country) => sourceByCountry.get(country.code)?.signal.interestPercentile ?? null)),
    growth: mean(scoredRecommendations.map((country) => sourceByCountry.get(country.code)?.signal.momentumScore ?? null)),
    audienceFit: mean(recommendations.map((country) => country.audienceFitScore)),
    productFit: mean(recommendations.map((country) => country.productFitScore)),
    competition: null as null,
    monetization: null as null,
  };
  const primaryMeasuredRecommendation = recommendations.find((country) => country.score !== null) ?? null;
  const sourceTypes = [...new Set(collected.map((country) => country.source))];
  const trendSummary = availableSignals.length
    ? ai?.trendSummary ?? localeText(locale, "Synthèse IA de tendance indisponible.", "AI trend summary unavailable.")
    : localeText(locale, "Aucune série Google Trends exploitable : les pays proposés sont des hypothèses IA à tester, pas des marchés validés.", "No usable Google Trends series: the suggested countries are AI hypotheses to test, not validated markets.");
  const confidence: "low" | "medium" = scoredRecommendations.length >= 2
    && scoredRecommendations.every((country) => country.confidence === "medium")
    ? "medium"
    : "low";
  const status: MarketStatus = !ai
    ? "ai_unavailable"
    : availableSignals.length === 0
      ? "qualitative"
      : availableSignals.length < MARKET_RADAR_COUNTRIES.length
        ? "partial"
        : "measured";

  const measuredCountryNames = availableSignals.map((country) => country.name).join(", ");
  const evidence = [
    {
      label: localeText(locale, "Couverture Google Trends", "Google Trends coverage"),
      value: localeText(locale,
        `${availableSignals.length} pays sur ${MARKET_RADAR_COUNTRIES.length} avec une série suffisante${measuredCountryNames ? ` (${measuredCountryNames})` : ""}.`,
        `${availableSignals.length} of ${MARKET_RADAR_COUNTRIES.length} countries have a sufficient series${measuredCountryNames ? ` (${measuredCountryNames})` : ""}.`),
    },
    {
      label: localeText(locale, "Lecture du signal", "Signal interpretation"),
      value: localeText(locale,
        "Les indices et évolutions sont calculés dans l’historique propre à chaque pays; ils ne mesurent pas un volume absolu.",
        "Indices and changes are calculated within each country’s own history; they do not measure absolute volume."),
    },
    {
      label: localeText(locale, "Score de priorité de test", "Test-priority score"),
      value: localeText(locale,
        "25 % intérêt récent vs historique local, 25 % élan récent, 30 % adéquation audience IA et 20 % adéquation idée/format IA.",
        "25% recent interest vs local history, 25% recent momentum, 30% AI audience fit, and 20% AI idea/format fit."),
    },
    {
      label: localeText(locale, "Sources", "Sources"),
      value: trendSourceName(sourceTypes, locale),
    },
  ];

  const risks = [
    ...(ai?.risks ?? []),
    ...fixedRisks(locale),
    ...(!ai ? [localeText(locale, "L’analyse IA est momentanément indisponible; aucun score global n’est affiché.", "AI analysis is temporarily unavailable; no overall score is shown.")] : []),
    ...(availableSignals.length < MARKET_RADAR_COUNTRIES.length && availableSignals.length > 0
      ? [localeText(locale, "Les données sont partielles : certains pays n’ont pas fourni assez de points ou la source était indisponible.", "Data is partial: some countries returned too few points or the source was unavailable.")]
      : []),
  ].filter((risk, index, all) => all.indexOf(risk) === index).slice(0, 9);

  const ideas = ai ? [{
    title: ai.idea.title,
    promise: ai.idea.promise,
    audience: ai.idea.audience,
    outline: ai.idea.outline,
    upsell: ai.idea.upsell,
  }] : [];

  return {
    query: normalizedInput,
    status,
    score: ai ? score : null,
    confidence,
    summary: ai?.summary ?? localeText(locale, "Les signaux de recherche sont disponibles, mais l’analyse IA n’a pas pu être produite. Réessaie plus tard.", "Search signals are available, but the AI analysis could not be generated. Try again later."),
    liveSources: sourceTypes.some((source) => ["live", "cache", "stale"].includes(source)) ? [trendSourceName(sourceTypes, locale), "Vendeo AI"] : ai ? ["Vendeo AI · analyse qualitative"] : [],
    dimensions: ai ? dimensions : {
      demand: mean(availableSignals.map((country) => country.signal.interestPercentile)),
      growth: mean(availableSignals.map((country) => country.signal.momentumScore)),
      audienceFit: null,
      productFit: null,
      competition: null,
      monetization: null,
    },
    evidence,
    trend: {
      countryCode: primaryMeasuredRecommendation?.code ?? null,
      currentIndex: primaryMeasuredRecommendation?.trend.currentIndex ?? null,
      previousIndex: primaryMeasuredRecommendation?.trend.previousIndex ?? null,
      direction: primaryMeasuredRecommendation?.trend.direction ?? "unknown",
      points: primaryMeasuredRecommendation?.trend.points ?? [],
      summary: trendSummary,
    },
    recommendedCountries: ai ? recommendations : [],
    ideas,
    risks,
    methodology: localeText(locale,
      "Score indicatif pour prioriser un test, pas une prévision de ventes. Concurrence et volonté de payer non mesurées.",
      "An indicative score to prioritize a test, not a sales forecast. Competition and willingness to pay are not measured."),
  };
}
