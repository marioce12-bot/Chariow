export type MarketRadarInput = {
  idea: string;
  country: string;
  audience: string;
  format: "ebook" | "formation" | "template" | "abonnement";
};

export type MarketRadarReport = {
  query: MarketRadarInput;
  score: number;
  confidence: "low" | "medium" | "high";
  liveSources: string[];
  dimensions: { demand: number; growth: number; competition: number; countryFit: number; monetization: number };
  evidence: Array<{ label: string; value: string }>;
  recommendedPrice: { min: number; max: number; currency: "XOF" };
  ideas: Array<{ title: string; promise: string; audience: string; outline: string[]; upsell: string }>;
  risks: string[];
};

const COUNTRY_NAMES: Record<string, string> = { BJ: "Bénin", CI: "Côte d’Ivoire", TG: "Togo", SN: "Sénégal", CM: "Cameroun", BF: "Burkina Faso" };

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

function scoreTrend(data: Awaited<ReturnType<typeof fetchGoogleTrends>>) {
  const values = data?.interest_over_time?.timeline_data?.flatMap((row) => row.values?.map((item) => Number(item.value ?? 0)) ?? []).filter(Number.isFinite) ?? [];
  if (!values.length) return null;
  const recent = values.slice(-4).reduce((sum, value) => sum + value, 0) / Math.min(4, values.length);
  const previous = values.slice(-8, -4).reduce((sum, value) => sum + value, 0) / Math.max(1, Math.min(4, values.slice(-8, -4).length));
  const growth = previous > 0 ? clamp(50 + ((recent - previous) / previous) * 100) : clamp(recent);
  return { demand: clamp(recent), growth, values };
}

export async function buildMarketRadar(input: MarketRadarInput): Promise<MarketRadarReport> {
  const fallback = fallbackReport(input);
  try {
    const trends = await fetchGoogleTrends(input);
    const scored = scoreTrend(trends);
    if (!scored) return fallback;
    const competition = clamp(100 - scored.demand * 0.35);
    const countryFit = input.country ? clamp(60 + scored.demand * 0.4) : 40;
    const monetization = input.format === "ebook" ? 76 : input.format === "template" ? 71 : 64;
    const score = clamp(scored.demand * 0.3 + scored.growth * 0.25 + competition * 0.1 + countryFit * 0.2 + monetization * 0.15);
    return { ...fallback, score, confidence: "medium", liveSources: ["Google Trends via SerpApi"], dimensions: { demand: scored.demand, growth: scored.growth, competition, countryFit, monetization }, evidence: [{ label: "Recherche", value: `${scored.demand}/100 sur les 12 derniers mois` }, { label: "Évolution récente", value: `${scored.growth}/100` }, { label: "Pays analysé", value: COUNTRY_NAMES[input.country] ?? input.country }, { label: "Source", value: "Google Trends via SerpApi" }], risks: ["La tendance mesure l’intérêt de recherche, pas les ventes garanties.", "Valide l’idée avec une prévente ou une page d’attente avant de produire."], };
  } catch (error) {
    return { ...fallback, risks: [`La source live est momentanément indisponible: ${error instanceof Error ? error.message : "erreur inconnue"}`, ...fallback.risks] };
  }
}
