import { beforeEach, describe, expect, it, vi } from "vitest";
import { askImole } from "@/lib/ai/imole";
import { refineAutopilotVerdictWithAI } from "./autopilot-verdict";
import type { AutopilotDecision, AutopilotInput } from "@/lib/autopilot";

vi.mock("@/lib/ai/imole", () => ({ askImole: vi.fn() }));

const askImoleMock = vi.mocked(askImole);

beforeEach(() => askImoleMock.mockReset());

describe("refineAutopilotVerdictWithAI", () => {
  it("préserve la décision et le motif de protection de valeur client", async () => {
    const input: AutopilotInput = {
      spend: 300,
      netRevenue: 100,
      grossRevenue: 120,
      completedSales: 1,
      daysSinceLaunch: 5,
      dailyBudget: 100,
      attributionReliable: true,
      historicalCustomerValue: 1000,
      storeCustomerCount: 30,
      campaignCustomerCount: 1,
    };
    const base: AutopilotDecision = {
      decision: "keep_running",
      reasons: ["Valeur client fiable : coût par client sous le plafond."],
      roas: 1 / 3,
      customerValueProtection: true,
      recommendation: "continue",
      recommendationReason: "Données clients fiables.",
      cpaThreshold: 500,
    };

    const result = await refineAutopilotVerdictWithAI(input, base, [], {
      campaignTitle: "Campagne test",
      currency: "XOF",
      platform: "meta",
    });

    expect(result).toEqual(base);
    expect(askImoleMock).not.toHaveBeenCalled();
  });
});
