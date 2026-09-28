import { describe, expect, it } from "vitest";
import { computeAutopilotDecision } from "./autopilot";

const base = { grossRevenue: 0, daysSinceLaunch: 5, dailyBudget: 100 };

describe("computeAutopilotDecision", () => {
  it("ne conclut rien sans dépense", () => {
    const result = computeAutopilotDecision({ ...base, spend: 0, netRevenue: 0, completedSales: 0 });
    expect(result.decision).toBe("insufficient_data");
  });

  it("reste en apprentissage au tout début", () => {
    const result = computeAutopilotDecision({ ...base, daysSinceLaunch: 0.5, spend: 10, netRevenue: 0, completedSales: 0 });
    expect(result.decision).toBe("learning");
  });

  it("laisse tourner une campagne rentable", () => {
    const result = computeAutopilotDecision({ ...base, spend: 300, netRevenue: 600, grossRevenue: 650, completedSales: 4 });
    expect(result.decision).toBe("keep_running");
    expect(result.roas).toBeCloseTo(2, 5);
  });

  it("met en pause une campagne qui brûle le budget sans vente", () => {
    const result = computeAutopilotDecision({ ...base, spend: 300, netRevenue: 0, completedSales: 0 });
    expect(result.decision).toBe("pause");
    expect(result.reasons.join(" ")).toContain("aucune vente");
  });

  it("met en pause quand le ROAS est nettement sous le seuil", () => {
    const result = computeAutopilotDecision({ ...base, spend: 300, netRevenue: 60, grossRevenue: 60, completedSales: 1 });
    expect(result.decision).toBe("pause");
    expect(result.roas).toBeCloseTo(0.2, 5);
  });

  it("ne met pas en pause trop tôt malgré un ROAS faible (dépense insuffisante)", () => {
    const result = computeAutopilotDecision({ ...base, spend: 120, netRevenue: 30, grossRevenue: 30, completedSales: 1 });
    expect(result.decision).toBe("keep_running");
  });
});
