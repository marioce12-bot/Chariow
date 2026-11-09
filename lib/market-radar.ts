import { decryptSecret } from "@/lib/crypto";
import { searchMetaInterests } from "@/lib/meta/api";
import {
  buildInterestSearchQueries,
  normalizeInterestLabel,
  pickBestMetaInterest,
  rankMetaInterestCandidates,
  type MetaInterestCandidate,
  type MetaInterestTarget,
} from "@/lib/ad-campaigns/meta-targeting";
import { analyzeMarketRadarWithAI, type MarketRadarAIResult, type MarketRadarDay, type MarketRadarFormat, type MarketRadarProductContext, type MarketRadarTrendDirection } from "@/lib/market-radar-ai";
import { getMarketRadarCountryName, MARKET_RADAR_COUNTRIES, type MarketRadarCountryCode } from "@/lib/market-radar-countries";
import { scoreMarketTrend, type MarketTrendDirection, type MarketTrendSignal } from "@/lib/market-radar-signals";

export type { MarketRadarDay, MarketRadarFormat, MarketRadarProductContext } from "@/lib/market-radar-ai";
export type MarketRadarInput = {
  idea: string;
  product: MarketRadarProductContext | null;
  format: MarketRadarFormat;
  locale?: "fr" | "en";
};

export type MarketSignalClient = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => any;
};

type TrendSource = "live" | "cache" | "stale" | "unavailable" | "error";
type MarketStatus = "crossed" | "qualitative" | "ai_unavailable";
type MetaInterestStatus = "available" | "not_connected" | "unavailable" | "no_matches";

export type MarketRadarCountryRecommendation = {
  code: MarketRadarCountryCode;
  name: string;
  score: number;
  audienceFitScore: number;
  productFitScore: number;
  confidence: "low" | "medium";
  signalStatus: "crossed" | "qualitative";
  trendDirection: MarketRadarTrendDirection;
  trendSummary: string;
  rationale: string;
  firstTest: string;
};

export type MarketRadarReport = {
  query: MarketRadarInput;
  status: MarketStatus;
  analysisMode: "crossed" | "qualitative";
  score: number | null;
  confidence: "low" | "medium";
  scoreRationale: string;
  summary: string;
  dimensions: {
    demandPotential: number | null;
    audienceFit: number | null;
    productFit: number | null;
    monetizationPotential: number | null;
  };
  evidence: Array<{ label: string; value: string }>;
  trend: { direction: MarketRadarTrendDirection; summary: string };
  targetAudience: {
    profile: string;
    rationale: string;
    metaInterests: MetaInterestTarget[];
    metaInterestStatus: MetaInterestStatus;
  };
  campaignTiming: { days: MarketRadarDay[]; rationale: string };
  recommendedCountries: MarketRadarCountryRecommendation[];
  ideas: Array<{ title: string; promise: string; audience: string; outline: string[]; upsell: string }>;
  risks: string[];
  methodology: string;
};

const TRENDS_TTL_MS = 7 * 86400000;
const SERPAPI_MONTHLY_LIMIT = 200;
const IDEA_MAX_LENGTH = 180;
const PRODUCT_DESCRIPTION_MAX_LENGTH = 800;

export function normalizeMarketQuery(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function cleanText(value: string, maximum: number) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().replace(/google\s*trends|serpapi/gi, "signaux de recherche").slice(0, maximum);
}

function mean(values: Array<number | null>) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return valid.length ? clamp(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null;
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
  if (!response.ok) throw new Error(`Search signal request failed (${response.status})`);
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
    if (cached?.payload && typeof cached.payload === "object") return { payload: cached.payload as Record<string, unknown>, source: "stale" as const };
    throw new Error("Search signal monthly quota reached");
  }

  const payload = await fetchGoogleTrends(normalized, country as MarketRadarCountryCode);
  if (!payload) return { payload: null, source: "unavailable" as const };
  await supabase.from("market_signals").upsert({ cache_key: cacheKey, provider: "serpapi", payload, fetched_at: new Date().toISOString() });
  await supabase.rpc("increment_api_usage", { p_provider: "serpapi", p_month: month });
  return { payload, source: "live" as const };
}

function localeText(locale: "fr" | "en", fr: string, en: string) {
  return locale === "en" ? en : fr;
}

function fixedRisks(locale: "fr" | "en") {
  return locale === "en" ? [
    "The AI score is a qualitative estimate to prioritize a test, not a sales or conversion forecast.",
    "Suggested campaign days are hypotheses; compare real results before scaling.",
    "Interest suggestions shown are options found in Meta at analysis time; availability can change.",
    "Validate demand and willingness to pay with customer conversations or a small test before producing the full offer.",
  ] : [
    "Le score IA est une estimation qualitative pour prioriser un test, pas une prévision de ventes ou de conversions.",
    "Les jours de campagne proposés sont des hypothèses; compare les résultats réels avant d’augmenter le budget.",
    "Les centres d’intérêt affichés sont des options trouvées dans Meta au moment de l’analyse; leur disponibilité peut évoluer.",
    "Valide la demande et la volonté de payer par des échanges clients ou un petit test avant de produire l’offre complète.",
  ];
}

function safeProduct(product: MarketRadarProductContext | null | undefined): MarketRadarProductContext | null {
  if (!product || typeof product !== "object") return null;
  const name = typeof product.name === "string" ? cleanText(product.name, 120) : "";
  if (!name) return null;
  const cleanNullable = (value: unknown, max: number) => typeof value === "string" && value.trim() ? cleanText(value, max) : null;
  return {
    name,
    description: cleanNullable(product.description, PRODUCT_DESCRIPTION_MAX_LENGTH),
    category: cleanNullable(product.category, 100),
    type: cleanNullable(product.type, 100),
    price: cleanNullable(product.price, 40),
    currency: cleanNullable(product.currency, 10),
  };
}

function emptyMetaResult(status: MetaInterestStatus) {
  return { interests: [] as MetaInterestTarget[], status };
}

async function resolveMetaInterests(
  supabase: MarketSignalClient | undefined,
  userId: string | undefined,
  labels: string[],
  locale: "fr" | "en",
): Promise<{ interests: MetaInterestTarget[]; status: MetaInterestStatus }> {
  if (!supabase || !userId || !labels.length) return emptyMetaResult("not_connected");
  let account: { access_token_encrypted?: string | null } | null = null;
  try {
    const result = await supabase.from("meta_ad_accounts")
      .select("id,access_token_encrypted,is_selected")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("is_selected", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) return emptyMetaResult("unavailable");
    account = result.data;
  } catch {
    return emptyMetaResult("unavailable");
  }
  if (!account?.access_token_encrypted) return emptyMetaResult("not_connected");

  let accessToken: string;
  try { accessToken = decryptSecret(account.access_token_encrypted); }
  catch { return emptyMetaResult("unavailable"); }

  const seenQueries = new Set<string>();
  const queries = labels.flatMap((label) => {
    const clean = cleanText(label, 80);
    const key = normalizeInterestLabel(clean);
    if (clean.length < 2 || !key || seenQueries.has(key)) return [];
    seenQueries.add(key);
    return [clean];
  }).slice(0, 4);
  let successfulSearches = 0;
  const collected = await Promise.all(queries.map(async (label) => {
    const candidates = new Map<string, MetaInterestCandidate>();
    const search = async (query: string) => {
      try {
        const found = locale === "fr"
          ? await searchMetaInterests(query, accessToken, { locale: "fr_FR" })
          : await searchMetaInterests(query, accessToken);
        successfulSearches += 1;
        for (const candidate of found) {
          if (candidate && /^\d{1,30}$/.test(candidate.id) && candidate.name && !candidates.has(candidate.id)) candidates.set(candidate.id, candidate);
        }
      } catch {
        // A Meta lookup failure does not discard the rest of the Radar analysis.
      }
    };
    await search(label);
    let picked = pickBestMetaInterest(label, [...candidates.values()]);
    if (!picked || picked.confidence === "close") {
      const fallback = buildInterestSearchQueries(label).slice(1, 2)[0];
      if (fallback) await search(fallback);
      picked = pickBestMetaInterest(label, [...candidates.values()]);
    }
    if (picked) return [{ id: picked.interest.id, name: picked.interest.name }];
    return rankMetaInterestCandidates(label, [...candidates.values()], 1);
  }));

  const interests: MetaInterestTarget[] = [];
  const seenIds = new Set<string>();
  for (const item of collected.flat()) {
    if (!seenIds.has(item.id)) { seenIds.add(item.id); interests.push(item); }
    if (interests.length >= 5) break;
  }
  if (interests.length) return { interests, status: "available" };
  if (successfulSearches) return emptyMetaResult("no_matches");
  return emptyMetaResult("unavailable");
}

function unavailableReport(input: MarketRadarInput, locale: "fr" | "en"): MarketRadarReport {
  return {
    query: input,
    status: "ai_unavailable",
    analysisMode: "qualitative",
    score: null,
    confidence: "low",
    scoreRationale: "",
    summary: localeText(locale, "L’analyse IA n’a pas abouti. Réessaie dans un instant.", "The AI analysis did not complete. Please try again shortly."),
    dimensions: { demandPotential: null, audienceFit: null, productFit: null, monetizationPotential: null },
    evidence: [],
    trend: { direction: "qualitative", summary: "" },
    targetAudience: { profile: "", rationale: "", metaInterests: [], metaInterestStatus: "not_connected" },
    campaignTiming: { days: [], rationale: "" },
    recommendedCountries: [],
    ideas: [],
    risks: [],
    methodology: localeText(locale, "Les résultats IA sont des hypothèses de test, pas des prévisions de ventes.", "AI results are test hypotheses, not sales forecasts."),
  };
}

export async function buildMarketRadar(
  input: MarketRadarInput,
  supabase?: MarketSignalClient,
  userId?: string,
): Promise<MarketRadarReport> {
  const locale = input.locale === "en" ? "en" : "fr";
  const product = safeProduct(input.product);
  const idea = cleanText(input.idea, IDEA_MAX_LENGTH);
  const normalizedInput: MarketRadarInput = {
    idea: idea || product?.name || "",
    product,
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

  let ai: MarketRadarAIResult | null = null;
  try {
    ai = await analyzeMarketRadarWithAI({
      idea: normalizedInput.idea,
      product: normalizedInput.product,
      format: normalizedInput.format,
      locale,
      markets: collected.map(({ code, name, signal }) => ({
        code,
        name,
        hasUsableSearchSignal: signal.status === "available",
        interestPercentile: signal.interestPercentile,
        momentumScore: signal.momentumScore,
        direction: signal.direction,
      })),
    });
  } catch {
    ai = null;
  }

  if (!ai) return unavailableReport(normalizedInput, locale);

  const availableSignals = collected.filter((country) => country.signal.status === "available");
  const analysisMode = availableSignals.length ? "crossed" : "qualitative";
  const confidence: "low" | "medium" = availableSignals.length >= 2 ? "medium" : "low";
  const countryByCode = new Map(collected.map((market) => [market.code, market]));
  const recommendations: MarketRadarCountryRecommendation[] = ai.recommendedCountries.map((country) => {
    const market = countryByCode.get(country.code);
    const signalAvailable = market?.signal.status === "available";
    const signalStatus: "crossed" | "qualitative" = signalAvailable ? "crossed" : "qualitative";
    const trendDirection: MarketRadarTrendDirection = signalAvailable && market?.signal.direction !== "unknown" ? market.signal.direction : "qualitative";
    return {
      code: country.code,
      name: getMarketRadarCountryName(country.code, locale),
      score: country.score,
      audienceFitScore: country.audienceFitScore,
      productFitScore: country.productFitScore,
      confidence: signalAvailable ? confidence : "low",
      signalStatus,
      trendDirection,
      trendSummary: cleanText(country.trendSummary, 240),
      rationale: cleanText(country.rationale, 360),
      firstTest: cleanText(country.firstTest, 220),
    };
  }).sort((left, right) => right.score - left.score);

  const metaResolution = await resolveMetaInterests(supabase, userId, ai.targetAudience.metaInterestQueries, locale);
  const overallTrendDirection: MarketRadarTrendDirection = availableSignals.length
    ? ai.trend.direction
    : "qualitative";
  const evidence = [
    {
      label: localeText(locale, "Mode d’analyse", "Analysis mode"),
      value: analysisMode === "crossed"
        ? localeText(locale, "Analyse IA enrichie de signaux disponibles.", "AI analysis enriched with available signals.")
        : localeText(locale, "Analyse IA qualitative.", "Qualitative AI analysis."),
    },
    {
      label: localeText(locale, "Bases du score", "Score basis"),
      value: localeText(locale,
        "Potentiel du besoin, adéquation audience/offre et possibilité de monétisation; appréciations IA, pas mesures de ventes.",
        "Need potential, audience/offer fit, and monetization potential; AI judgments, not sales measurements."),
    },
  ];

  const fixed = fixedRisks(locale);
  const risks = [...ai.risks.map((risk) => cleanText(risk, 220)), ...fixed]
    .filter((risk, index, all) => Boolean(risk) && all.indexOf(risk) === index)
    .slice(0, 8);
  const ideas = [{
    title: cleanText(ai.idea.title, 120),
    promise: cleanText(ai.idea.promise, 240),
    audience: cleanText(ai.idea.audience, 140),
    outline: ai.idea.outline.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 5),
    upsell: cleanText(ai.idea.upsell, 180),
  }];

  return {
    query: normalizedInput,
    status: analysisMode,
    analysisMode,
    score: clamp(ai.overallScore),
    confidence,
    scoreRationale: cleanText(ai.scoreRationale, 360),
    summary: cleanText(ai.summary, 500),
    dimensions: {
      demandPotential: clamp(ai.scores.demandPotential),
      audienceFit: clamp(ai.scores.audienceFit),
      productFit: clamp(ai.scores.productFit),
      monetizationPotential: clamp(ai.scores.monetizationPotential),
    },
    evidence,
    trend: {
      direction: overallTrendDirection,
      summary: cleanText(ai.trend.summary, 360),
    },
    targetAudience: {
      profile: cleanText(ai.targetAudience.profile, 180),
      rationale: cleanText(ai.targetAudience.rationale, 360),
      metaInterests: metaResolution.interests,
      metaInterestStatus: metaResolution.status,
    },
    campaignTiming: {
      days: ai.campaignTiming.days,
      rationale: cleanText(ai.campaignTiming.rationale, 360),
    },
    recommendedCountries: recommendations,
    ideas,
    risks,
    methodology: localeText(locale,
      "Score indicatif généré par l’IA pour prioriser un test. Les tendances, audiences et jours proposés sont des pistes à valider; ce n’est pas une prévision de ventes ou de conversions.",
      "An indicative AI score to prioritize a test. Suggested trends, audiences, and days are leads to validate, not a sales or conversion forecast."),
  };
}
