import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/openrouter", () => ({ askOpenRouter: vi.fn() }));
vi.mock("@/lib/meta/api", () => ({ searchMetaInterests: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: vi.fn(() => "mock-meta-token") }));

import { askOpenRouter } from "@/lib/ai/openrouter";
import { searchMetaInterests } from "@/lib/meta/api";
import { decryptSecret } from "@/lib/crypto";
import { buildMarketRadar } from "@/lib/market-radar";
import { MARKET_RADAR_COUNTRIES, MARKET_RADAR_SIGNAL_COUNTRIES } from "@/lib/market-radar-countries";
import { scoreMarketTrend } from "@/lib/market-radar-signals";

const aiResponse = JSON.stringify({
  summary: "Google Trends n'est pas indispensable; le besoin doit être testé directement.",
  overallScore: 82,
  scoreRationale: "Le sujet répond à un besoin compréhensible et l’offre peut se tester à faible coût.",
  trend: { direction: "up", summary: "SerpApi signale une progression locale à interpréter avec prudence." },
  scores: { demandPotential: 78, audienceFit: 84, productFit: 80, monetizationPotential: 68 },
  targetAudience: {
    profile: "Jeunes actifs qui veulent mieux organiser leur budget.",
    rationale: "Le bénéfice est concret et concerne une décision financière régulière.",
    metaInterestQueries: ["Finance personnelle", "Entrepreneuriat"],
  },
  campaignTiming: { days: ["monday", "thursday"], rationale: "Deux jours espacés permettent de comparer les premiers tests." },
  recommendedCountries: [
    { code: "BJ", score: 84, audienceFitScore: 83, productFitScore: 80, trendDirection: "up", trendSummary: "La dynamique locale semble favorable, sans garantir une conversion.", rationale: "Le guide peut être adapté avec des exemples de budget et de paiement locaux.", firstTest: "Teste une page courte avec un exemple de budget en XOF." },
    { code: "CI", score: 78, audienceFitScore: 79, productFitScore: 76, trendDirection: "qualitative", trendSummary: "Piste à explorer avec des exemples locaux.", rationale: "Le format peut s’adapter à des besoins proches, à vérifier auprès de clients.", firstTest: "Compare deux promesses auprès d’un petit groupe." },
    { code: "SN", score: 73, audienceFitScore: 74, productFitScore: 72, trendDirection: "qualitative", trendSummary: "Hypothèse qualitative à valider.", rationale: "Une version francophone est plausible, mais le besoin exact doit être confirmé.", firstTest: "Demande des retours sur un plan simplifié." },
    { code: "CM", score: 71, audienceFitScore: 72, productFitScore: 70, trendDirection: "qualitative", trendSummary: "Piste à vérifier avec une offre localisée.", rationale: "Le format peut être adapté à des exemples et moyens de paiement locaux.", firstTest: "Compare une page de vente avec des exemples adaptés." },
    { code: "GN", score: 70, audienceFitScore: 71, productFitScore: 69, trendDirection: "qualitative", trendSummary: "Hypothèse à valider auprès de l’audience visée.", rationale: "Le guide peut être adapté en français avec des exemples de budget locaux.", firstTest: "Teste une courte présentation en français auprès de prospects." },
    { code: "MA", score: 68, audienceFitScore: 70, productFitScore: 67, trendDirection: "qualitative", trendSummary: "Piste exploratoire, sans mesure locale disponible.", rationale: "Une version adaptée aux usages et aux paiements locaux peut être explorée.", firstTest: "Recueille des retours sur une offre d’entrée de gamme localisée." },
    { code: "CD", score: 66, audienceFitScore: 68, productFitScore: 65, trendDirection: "qualitative", trendSummary: "Hypothèse qualitative, à tester avant d’investir.", rationale: "Le sujet peut intéresser une audience francophone si le contenu est localisé.", firstTest: "Valide la promesse avec un petit groupe de prospects." },
    { code: "GH", score: 60, audienceFitScore: 62, productFitScore: 58, trendDirection: "qualitative", trendSummary: "Hypothèse pour une portée explicitement anglophone.", rationale: "Une version anglaise ne se justifie que si le marché est demandé.", firstTest: "Teste une courte version anglaise auprès de prospects." },
    { code: "NG", score: 58, audienceFitScore: 60, productFitScore: 56, trendDirection: "qualitative", trendSummary: "Piste exploratoire, sans mesure locale disponible.", rationale: "Une portée anglophone doit être demandée puis vérifiée localement.", firstTest: "Recueille des retours sur une offre d’entrée de gamme." },
    { code: "KE", score: 55, audienceFitScore: 57, productFitScore: 54, trendDirection: "qualitative", trendSummary: "Hypothèse anglophone à confirmer avant tout investissement.", rationale: "Une adaptation de langue et de paiement est nécessaire pour ce marché.", firstTest: "Valide la promesse avec un petit groupe de prospects." },
  ],
  idea: {
    title: "Guide pratique de gestion",
    promise: "Une méthode simple pour mieux gérer son budget au quotidien.",
    audience: "Jeunes actifs et entrepreneurs débutants",
    outline: ["Faire le point", "Organiser son budget", "Suivre ses habitudes"],
    upsell: "Ajouter un modèle de suivi téléchargeable.",
  },
  risks: ["La volonté de payer reste à valider directement."],
});

const input = {
  idea: "Guide budget mobile money",
  product: null,
  format: "ebook" as const,
  locale: "fr" as const,
};

function timeline(values: number[]) {
  return { interest_over_time: { timeline_data: values.map((value) => ({ values: [{ extracted_value: value }] })) } };
}

function supabaseWithActiveMetaAccount() {
  const marketQuery: Record<string, any> = {};
  marketQuery.select = vi.fn(() => marketQuery);
  marketQuery.eq = vi.fn(() => marketQuery);
  marketQuery.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  const accountQuery: Record<string, any> = {};
  accountQuery.select = vi.fn(() => accountQuery);
  accountQuery.eq = vi.fn(() => accountQuery);
  accountQuery.order = vi.fn(() => accountQuery);
  accountQuery.limit = vi.fn(() => accountQuery);
  accountQuery.maybeSingle = vi.fn(async () => ({ data: { id: "meta-account", access_token_encrypted: "encrypted-fixture" }, error: null }));
  return {
    from: vi.fn((table: string) => table === "meta_ad_accounts" ? accountQuery : marketQuery),
    rpc: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.stubEnv("SERPAPI_KEY", "");
  vi.mocked(askOpenRouter).mockResolvedValue(aiResponse);
  vi.mocked(searchMetaInterests).mockResolvedValue([]);
});

describe("scoreMarketTrend", () => {
  it("returns unknown rather than inventing a direction when the history is too short", () => {
    const result = scoreMarketTrend(timeline([0, 0, 14, 20, 28]));
    expect(result.status).toBe("insufficient");
    expect(result.direction).toBe("unknown");
    expect(result.momentumScore).toBeNull();
  });

  it("distinguishes a usable rising local signal from an all-zero series", () => {
    const rising = scoreMarketTrend(timeline([20, 24, 26, 30, 25, 28, 29, 30, 70, 70, 70, 70]));
    const zero = scoreMarketTrend(timeline(Array.from({ length: 12 }, () => 0)));
    expect(rising.status).toBe("available");
    expect(rising.direction).toBe("up");
    expect(rising.currentIndex).toBe(70);
    expect(rising.interestPercentile).toBe(100);
    expect(zero.status).toBe("insufficient");
    expect(zero.direction).toBe("unknown");
  });

  it("ignores partial rows and values outside the 0–100 range", () => {
    const result = scoreMarketTrend({ interest_over_time: { timeline_data: [
      ...Array.from({ length: 8 }, (_, index) => ({ values: [{ extracted_value: 20 + index }] })),
      { partial_data: true, values: [{ extracted_value: 95 }] },
      { values: [{ extracted_value: 140 }] },
    ] } });
    expect(result.sampleCount).toBe(8);
    expect(result.points).not.toContain(95);
    expect(result.points).not.toContain(140);
  });
});

describe("buildMarketRadar", () => {
  it("always returns the AI's qualitative score, audience, countries, and weekdays without search data", async () => {
    const report = await buildMarketRadar(input);
    expect(report.status).toBe("qualitative");
    expect(report.score).toBe(82);
    expect(report.recommendedCountries).toHaveLength(7);
    expect(report.recommendedCountries.every((country) => country.score >= 0 && country.signalStatus === "qualitative")).toBe(true);
    expect(report.recommendedCountries[0].name).toBe("Bénin");
    expect(report.recommendedCountries.map((country) => country.name)).toContain("Guinée");
    expect(report.recommendedCountries.map((country) => country.name)).toContain("Maroc");
    expect(report.recommendedCountries.map((country) => country.name)).not.toContain("Ghana");
    expect(report.trend.direction).toBe("qualitative");
    expect(report.targetAudience.profile).toContain("Jeunes actifs");
    expect(report.targetAudience.metaInterests).toEqual([]);
    expect(report.targetAudience.metaInterestStatus).toBe("not_connected");
    expect(report.campaignTiming.days).toEqual(["monday", "thursday"]);
    expect(JSON.stringify(report).toLowerCase()).not.toContain("google trends");
    expect(JSON.stringify(report).toLowerCase()).not.toContain("serpapi");

    const messages = vi.mocked(askOpenRouter).mock.calls[0][0];
    const sent = JSON.parse(messages[1].content as string);
    expect(sent.product).toBeNull();
    expect(sent.markets).toHaveLength(MARKET_RADAR_SIGNAL_COUNTRIES.length);
    expect(sent.markets.map((market: { code: string }) => market.code)).toEqual(["BJ", "CI", "SN", "CM", "BF", "TG"]);
    expect(sent.candidateCountries).toHaveLength(MARKET_RADAR_COUNTRIES.length);
    expect(sent.candidateCountries.map((country: { code: string }) => country.code)).toContain("KE");
    expect(sent.candidateCountries.find((country: { code: string }) => country.code === "GN").recommendationEligible).toBe(true);
    expect(sent.candidateCountries.find((country: { code: string }) => country.code === "GH").recommendationEligible).toBe(false);
    expect(sent.countryScope).toMatchObject({ explicitlyBroader: false });
    expect(sent).not.toHaveProperty("audiences");
  });

  it("includes anglophone markets only when the product request explicitly widens scope", async () => {
    const report = await buildMarketRadar({ ...input, idea: "Guide budget mobile money pour les marchés francophones et anglophones de toute l’Afrique" });
    const messages = vi.mocked(askOpenRouter).mock.calls[0][0];
    const sent = JSON.parse(messages[1].content as string);

    expect(sent.countryScope.explicitlyBroader).toBe(true);
    expect(sent.candidateCountries.every((country: { recommendationEligible: boolean }) => country.recommendationEligible)).toBe(true);
    expect(report.recommendedCountries.map((country) => country.name)).toContain("Ghana");
    expect(report.recommendedCountries.map((country) => country.name)).toContain("Kenya");
  });

  it("crosses mocked local signals with the AI result without calling a live provider", async () => {
    vi.stubEnv("SERPAPI_KEY", "test-only-key");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const values = Array.from({ length: 12 }, (_, index) => index < 8 ? 30 : 70);
      return new Response(JSON.stringify(timeline(values)), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const report = await buildMarketRadar(input);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(report.status).toBe("crossed");
    expect(report.score).toBe(82);
    const signalCountryCodes = new Set<string>(MARKET_RADAR_SIGNAL_COUNTRIES.map((country) => country.code));
    const countriesWithSignals = report.recommendedCountries.filter((country) => signalCountryCodes.has(country.code));
    expect(countriesWithSignals.length).toBeGreaterThan(0);
    expect(countriesWithSignals.every((country) => country.signalStatus === "crossed" && country.trendDirection === "up")).toBe(true);
    expect(report.recommendedCountries.some((country) => !signalCountryCodes.has(country.code))).toBe(true);
    expect(report.analysisMode).toBe("crossed");
  });

  it("shows only interests returned by the mocked Meta search", async () => {
    vi.mocked(searchMetaInterests).mockImplementation(async (query) => query === "Finance personnelle"
      ? [{ id: "1001", name: "Finance personnelle" }]
      : query === "Entrepreneuriat" ? [{ id: "1002", name: "Entrepreneuriat" }] : []);
    const report = await buildMarketRadar(input, supabaseWithActiveMetaAccount(), "test-user");
    expect(decryptSecret).toHaveBeenCalledWith("encrypted-fixture");
    expect(searchMetaInterests).toHaveBeenCalledTimes(2);
    expect(report.targetAudience.metaInterests).toEqual([
      { id: "1001", name: "Finance personnelle" },
      { id: "1002", name: "Entrepreneuriat" },
    ]);
    expect(report.targetAudience.metaInterestStatus).toBe("available");
  });

  it("includes a selected catalog product in the AI input", async () => {
    const product = { name: "Guide Budget", description: "Un guide pour organiser ses dépenses", category: null, type: null, price: "4500", currency: "XOF" };
    await buildMarketRadar({ ...input, idea: "Guide Budget", product });
    const messages = vi.mocked(askOpenRouter).mock.calls[0][0];
    const sent = JSON.parse(messages[1].content as string);
    expect(sent.product).toMatchObject({ name: "Guide Budget", description: "Un guide pour organiser ses dépenses", price: "4500", currency: "XOF" });
  });

  it("does not leak model or provider errors into the public report", async () => {
    vi.mocked(askOpenRouter).mockRejectedValue(new Error("private-upstream-detail"));
    const report = await buildMarketRadar(input);
    expect(report.status).toBe("ai_unavailable");
    expect(report.score).toBeNull();
    expect(report.recommendedCountries).toEqual([]);
    expect(JSON.stringify(report)).not.toContain("private-upstream-detail");
    expect(JSON.stringify(report).toLowerCase()).not.toContain("google trends");
  });
});
