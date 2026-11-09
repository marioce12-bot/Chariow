import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeMarketRadarWithAI } from "@/lib/market-radar-ai";
import { MARKET_RADAR_COUNTRIES } from "@/lib/market-radar-countries";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const countryCodes = ["BJ", "CI", "SN", "CM", "BF", "GH"];
const structuredResponse = JSON.stringify({
  summary: "Analyse fictive pour valider le format Radar.",
  overallScore: 72,
  scoreRationale: "Réponse de test synthétique.",
  trend: { direction: "qualitative", summary: "Hypothèse qualitative à tester." },
  scores: { demandPotential: 70, audienceFit: 72, productFit: 74, monetizationPotential: 68 },
  targetAudience: {
    profile: "Personnes souhaitant mieux organiser leur budget.",
    rationale: "Fixture synthétique sans donnée de boutique.",
    metaInterestQueries: ["Budget personnel", "Éducation financière"],
  },
  campaignTiming: { days: ["monday", "thursday"], rationale: "Jours de test synthétiques." },
  recommendedCountries: countryCodes.map((code, index) => ({
    code,
    score: 80 - index,
    audienceFitScore: 79 - index,
    productFitScore: 78 - index,
    trendDirection: "qualitative",
    trendSummary: "Hypothèse qualitative de test.",
    rationale: "Raison synthétique de test.",
    firstTest: "Tester une page de présentation fictive.",
  })),
  idea: {
    title: "Guide fictif de budget",
    promise: "Aider à organiser un budget personnel.",
    audience: "Adultes qui souhaitent structurer leurs dépenses.",
    outline: ["Faire le point", "Planifier", "Suivre"],
    upsell: "Ajouter un outil de suivi fictif.",
  },
  risks: ["Fixture de test uniquement."],
});

describe("analyzeMarketRadarWithAI structured request", () => {
  it("sends an unbounded country array schema and preserves more than three eligible results", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-only-key");
    vi.stubEnv("OPENROUTER_MODEL", "google/gemini-2.5-flash-lite");
    vi.stubEnv("OPENROUTER_FALLBACK_MODELS", "none");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
      JSON.stringify({ choices: [{ message: { role: "assistant", content: structuredResponse } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeMarketRadarWithAI({
      idea: "Exemple fictif : guide pour organiser son budget",
      product: null,
      format: "ebook",
      locale: "fr",
      markets: [],
    });

    expect(result.recommendedCountries).toHaveLength(5);
    expect(result.recommendedCountries.length).toBeGreaterThan(3);
    expect(result.recommendedCountries.map(({ code }) => code)).not.toContain("GH");
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
    const request = JSON.parse(String(init?.body));
    expect(request).toMatchObject({
      model: "google/gemini-2.5-flash-lite",
      stream: false,
      provider: { require_parameters: true },
    });
    expect(request).not.toHaveProperty("models");
    expect(request.response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "vendeo_market_radar_v2", strict: true },
    });

    const recommendedCountries = request.response_format.json_schema.schema.properties.recommendedCountries;
    expect(recommendedCountries).toMatchObject({ type: "array", minItems: 1 });
    expect(recommendedCountries).not.toHaveProperty("maxItems");
    expect(recommendedCountries.items.properties.code.enum).toEqual(MARKET_RADAR_COUNTRIES.map(({ code }) => code));
  });
});
