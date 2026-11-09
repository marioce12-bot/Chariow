import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/openrouter", () => ({ askOpenRouter: vi.fn() }));

import { askOpenRouter } from "@/lib/ai/openrouter";
import { buildMarketRadar } from "@/lib/market-radar";
import { MARKET_RADAR_COUNTRIES } from "@/lib/market-radar-countries";
import { scoreMarketTrend } from "@/lib/market-radar-signals";

const aiResponse = JSON.stringify({
  summary: "L’idée répond à un besoin clair; valide d’abord une version légère.",
  trendSummary: "Le signal local progresse dans les pays où une série est disponible.",
  recommendedCountries: [
    { code: "BJ", audienceFitScore: 72, productFitScore: 77, rationale: "Le sujet se prête à une approche pratique pour cette audience.", firstTest: "Présente une page courte à quelques personnes de l’audience." },
    { code: "CI", audienceFitScore: 68, productFitScore: 74, rationale: "Le concept peut être adapté avec des exemples locaux.", firstTest: "Teste deux angles de promesse avant de rédiger le guide." },
    { code: "SN", audienceFitScore: 65, productFitScore: 71, rationale: "Une version francophone peut être explorée avec cette audience.", firstTest: "Demande des retours sur un plan de contenu simplifié." },
  ],
  idea: {
    title: "Guide pratique de gestion",
    promise: "Une méthode simple pour mieux gérer son budget au quotidien.",
    audience: "Entrepreneurs débutants",
    outline: ["Faire le point", "Organiser son budget", "Suivre ses habitudes"],
    upsell: "Ajouter un modèle de suivi téléchargeable.",
  },
  risks: ["Ne valide pas la volonté de payer sans un test direct."]
});

const input = {
  idea: "Guide budget mobile money",
  audience: "entrepreneurs",
  audiences: ["entrepreneurs"],
  format: "ebook" as const,
  locale: "fr" as const,
};

function timeline(values: number[]) {
  return { interest_over_time: { timeline_data: values.map((value) => ({ values: [{ extracted_value: value }] })) } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.mocked(askOpenRouter).mockResolvedValue(aiResponse);
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

  it("ignores partial rows and values outside the Google Trends 0–100 range", () => {
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
  it("does not create a fake market score when Trends is unavailable and still returns AI country hypotheses", async () => {
    const report = await buildMarketRadar(input);
    expect(report.status).toBe("qualitative");
    expect(report.score).toBeNull();
    expect(report.recommendedCountries).toHaveLength(3);
    expect(report.recommendedCountries.every((country) => country.score === null && country.signalStatus === "hypothesis")).toBe(true);
    expect(report.recommendedCountries[0].name).toBe("Bénin");
    expect(report.recommendedCountries[0].aiFitScore).toBe(74);
    expect(report.risks.join(" ")).toContain("Google Trends");

    const messages = vi.mocked(askOpenRouter).mock.calls[0][0];
    const sent = JSON.parse(messages[1].content as string);
    expect(sent.audiences).toEqual(input.audiences);
    expect(sent.format).toBe(input.format);
    expect(sent.markets).toHaveLength(MARKET_RADAR_COUNTRIES.length);
    expect(sent.markets.map((market: { code: string }) => market.code)).toEqual(["BJ", "CI", "SN", "CM", "BF", "TG"]);
  });

  it("keeps available countries when another Trends request fails and computes only the documented test-priority score", async () => {
    vi.stubEnv("SERPAPI_KEY", "test-key");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get("geo") === "CI") return new Response("{}", { status: 503 });
      const values = Array.from({ length: 16 }, (_, index) => ({ values: [{ extracted_value: index < 12 ? 30 : 70 }] }));
      return new Response(JSON.stringify(timeline(values.map((row) => row.values[0].extracted_value))), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const report = await buildMarketRadar(input);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(report.status).toBe("partial");
    expect(report.score).toBe(86);
    expect(report.trend.direction).toBe("up");
    expect(report.trend.points).toEqual([...Array(8).fill(30), ...Array(4).fill(70)]);
    expect(report.recommendedCountries.find((country) => country.code === "CI")?.score).toBeNull();
    expect(report.recommendedCountries.find((country) => country.code === "BJ")?.score).toBe(87);
    expect(report.recommendedCountries.filter((country) => country.score !== null).length).toBe(2);
    expect(report.evidence[0].value).toContain("5 pays sur 6");
  });

  it("never leaks model or provider errors into the public report", async () => {
    vi.mocked(askOpenRouter).mockRejectedValue(new Error("private-upstream-detail"));
    const report = await buildMarketRadar(input);
    expect(report.status).toBe("ai_unavailable");
    expect(report.score).toBeNull();
    expect(report.recommendedCountries).toEqual([]);
    expect(JSON.stringify(report)).not.toContain("private-upstream-detail");
  });
});
