export type MarketRadarInput = {
  idea: string;
  country: string;
  countries?: string[];
  audience: string;
  format: "ebook" | "formation" | "template" | "abonnement";
};

export type MarketSignalClient = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => any;
};

export type MarketRadarReport = {
  query: MarketRadarInput;
  score: number;
  confidence: "low" | "medium" | "high";
  liveSources: string[];
  dimensions: { demand: number; growth: number; competition: number; countryFit: number; monetization: number };
  evidence: Array<{ label: string; value: string }>;
  trend: { current: number; previous: number; direction: "up" | "down" | "stable"; points: number[] };
  recommendedPrice: { min: number; max: number; currency: "XOF" };
  ideas: Array<{ title: string; promise: string; audience: string; outline: string[]; upsell: string }>;
  risks: string[];
};

const COUNTRY_NAMES: Record<string, string> = { BJ: "Bénin", CI: "Côte d’Ivoire", TG: "Togo", SN: "Sénégal", CM: "Cameroun", BF: "Burkina Faso" };
const TRENDS_TTL_MS = 7 * 86400000;
const SERPAPI_MONTHLY_LIMIT = 200;

export function normalizeMarketQuery(value: string) { return value.toLowerCase().trim().replace(/\s+/g, " "); }

function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }

function fallbackReport(input: MarketRadarInput): MarketRadarReport {
  const hasIdea = input.idea.trim().length >= 8;
  const base = hasIdea ? 54 : 0;
  return {
    query: input,
    score: base,
    confidence: "low",
    liveSources: [],
    dimensions: { demand: base, growth: 0, competition: 0, countryFit: input.country ? 55 : 0, monetization: input.format ? 60 : 0 },
    evidence: [{ label: "Source", value: "Aucune source live configurée" }, { label: "Action", value: "Ajoute SERPAPI_KEY pour mesurer la demande Google" }],
    trend: { current: 0, previous: 0, direction: "stable", points: [] },
    recommendedPrice: { min: input.format === "ebook" ? 2500 : 5000, max: input.format === "ebook" ? 7500 : 25000, currency: "XOF" },
    ideas: [{ title: input.idea || "Ton prochain produit digital", promise: "Une promesse concrète adaptée à ton audience locale.", audience: input.audience || "Créateurs et entrepreneurs digitaux", outline: ["Le problème local", "La méthode étape par étape", "Les erreurs à éviter", "Un plan d’action sur 7 jours"], upsell: "Pack de templates ou mini-formation complémentaire" }],
    risks: ["Les données live ne sont pas encore disponibles.", "Ne prends pas ce score comme une validation marché tant qu’une source n’est pas connectée."],
  };
}

async function fetchGoogleTrends(input: MarketRadarInput) {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key) return null;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_trends");
  url.searchParams.set("q", input.idea);
  url.searchParams.set("geo", input.country || "BJ");
  url.searchParams.set("data_type", "TIMESERIES");
  url.searchParams.set("date", "today 12-m");
  url.searchParams.set("api_key", key);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Google Trends indisponible (${response.status})`);
  return await response.json() as { interest_over_time?: { timeline_data?: Array<{ values?: Array<{ value?: number }> }> }; related_queries?: Record<string, unknown> };
}

export async function fetchCachedTrends(supabase: MarketSignalClient, query: string, country: string) {
  const normalized = normalizeMarketQuery(query);
  const cacheKey = `trends:${country}:TIMESERIES:${normalized}`;
  const { data: cached } = await supabase.from("market_signals").select("payload,fetched_at").eq("cache_key", cacheKey).maybeSingle();
  const isFresh = cached?.fetched_at && Date.now() - new Date(cached.fetched_at).getTime() < TRENDS_TTL_MS;
  if (isFresh) return { payload: cached.payload as Record<string, unknown>, source: "cache" as const };

  const month = new Date().toISOString().slice(0, 7);
  const { data: usage } = await supabase.from("api_usage").select("count").eq("provider", "serpapi").eq("month", month).maybeSingle();
  if (Number(usage?.count ?? 0) >= SERPAPI_MONTHLY_LIMIT) {
    if (cached?.payload) return { payload: cached.payload as Record<string, unknown>, source: "stale" as const };
    throw new Error("Quota SerpApi atteint pour ce mois");
  }
  const input: MarketRadarInput = { idea: normalized, country, audience: "", format: "ebook" };
  const payload = await fetchGoogleTrends(input);
  if (!payload) throw new Error("SERPAPI_KEY non configurée");
  await supabase.from("market_signals").upsert({ cache_key: cacheKey, provider: "serpapi", payload, fetched_at: new Date().toISOString() });
  await supabase.rpc("increment_api_usage", { p_provider: "serpapi", p_month: month });
  return { payload: payload as Record<string, unknown>, source: "live" as const };
}

function scoreTrend(data: Awaited<ReturnType<typeof fetchGoogleTrends>>) {
  const values = data?.interest_over_time?.timeline_data?.filter((row) => !(row as { partial_data?: boolean }).partial_data).flatMap((row) => row.values?.map((item) => Number((item as { extracted_value?: number | string }).extracted_value ?? item.value ?? 0)) ?? []).filter(Number.isFinite) ?? [];
  if (!values.length) return null;
  const recent = values.slice(-4).reduce((sum, value) => sum + value, 0) / Math.min(4, values.length);
  const previous = values.slice(-8, -4).reduce((sum, value) => sum + value, 0) / Math.max(1, Math.min(4, values.slice(-8, -4).length));
  const growthDelta = previous > 0 ? ((recent - previous) / previous) * 100 : 0;
  const growth = clamp(50 + growthDelta);
  return { demand: clamp(recent), growth, values, current: clamp(recent), previous: clamp(previous), direction: growthDelta > 8 ? "up" as const : growthDelta < -8 ? "down" as const : "stable" as const };
}

export async function buildMarketRadar(input: MarketRadarInput, supabase?: MarketSignalClient): Promise<MarketRadarReport> {
  const fallback = fallbackReport(input);
  try {
    const countries = (input.countries?.length ? input.countries : [input.country]).slice(0, 5);
    const analyses = await Promise.all(countries.map(async (country) => {
      const cached = supabase ? await fetchCachedTrends(supabase, input.idea, country) : null;
      const trends = cached?.payload as Awaited<ReturnType<typeof fetchGoogleTrends>> ?? await fetchGoogleTrends({ ...input, country });
      return { country, source: cached?.source ?? "live", scored: scoreTrend(trends) };
    }));
    const valid = analyses.filter((item) => item.scored !== null) as Array<{ country: string; source: string; scored: NonNullable<ReturnType<typeof scoreTrend>> }>;
    if (!valid.length) return fallback;
    const scored = valid.reduce((total, item) => ({ demand: total.demand + item.scored.demand, growth: total.growth + item.scored.growth, current: total.current + item.scored.current, previous: total.previous + item.scored.previous }), { demand: 0, growth: 0, current: 0, previous: 0 });
    const count = valid.length;
    const averageDemand = clamp(scored.demand / count);
    const averageGrowth = clamp(scored.growth / count);
    const averageCurrent = clamp(scored.current / count);
    const averagePrevious = clamp(scored.previous / count);
    const direction = averageCurrent > averagePrevious + 5 ? "up" : averageCurrent < averagePrevious - 5 ? "down" : "stable";
    const competition = clamp(100 - averageDemand * 0.35);
    const countryFit = clamp(60 + averageDemand * 0.4);
    const monetization = input.format === "ebook" ? 76 : input.format === "template" ? 71 : 64;
    const score = clamp(averageDemand * 0.3 + averageGrowth * 0.25 + competition * 0.1 + countryFit * 0.2 + monetization * 0.15);
    const points = valid[0].scored.values.slice(-12);
    const countryNames = valid.map((item) => COUNTRY_NAMES[item.country] ?? item.country).join(", ");
    const sources = [...new Set(valid.map((item) => item.source))].join(", ");
    return { ...fallback, score, confidence: "medium", liveSources: [`Google Trends via SerpApi · ${sources}`], trend: { current: averageCurrent, previous: averagePrevious, direction, points }, dimensions: { demand: averageDemand, growth: averageGrowth, competition, countryFit, monetization }, evidence: [{ label: "Recherche moyenne", value: `${averageDemand}/100 sur les 12 derniers mois` }, { label: "Évolution récente", value: `${averageCurrent} contre ${averagePrevious} précédemment (${direction === "up" ? "en hausse" : direction === "down" ? "en baisse" : "stable"})` }, { label: "Pays analysés", value: countryNames }, { label: "Source", value: `Google Trends via SerpApi · ${sources}` }], risks: ["La tendance mesure l’intérêt de recherche, pas les ventes garanties.", "La dernière période partielle est exclue du calcul.", "Valide l’idée avec une prévente ou une page d’attente avant de produire."], };
  } catch (error) {
    return { ...fallback, risks: [`La source live est momentanément indisponible: ${error instanceof Error ? error.message : "erreur inconnue"}`, ...fallback.risks] };
  }
}
