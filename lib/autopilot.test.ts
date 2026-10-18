import { describe, expect, it } from "vitest";
import { aggregateDailyAutopilotReports, autopilotMutationBlockReason, canExecuteAutopilotMutation, computeAutopilotDecision, isAutopilotDataFresh } from "./autopilot";

const base = { grossRevenue: 0, daysSinceLaunch: 5, dailyBudget: 100, attributionReliable: true };

describe("computeAutopilotDecision", () => {
  it("considers missing/future/stale insight dates unsafe and accepts dates up to two days old", () => {
    const today = new Date("2026-10-17T12:00:00Z");
    expect(isAutopilotDataFresh("2026-10-17", today)).toBe(true);
    expect(isAutopilotDataFresh("2026-10-15", today)).toBe(true);
    expect(isAutopilotDataFresh("2026-10-14", today)).toBe(false);
    expect(isAutopilotDataFresh("2026-10-18", today)).toBe(false);
    expect(isAutopilotDataFresh(null, today)).toBe(false);
  });

  it("ne conclut rien sans dépense", () => {
    const result = computeAutopilotDecision({ ...base, spend: 0, netRevenue: 0, completedSales: 0 });
    expect(result.decision).toBe("insufficient_data");
  });

  it("ne met jamais en pause si le suivi des achats ou l'attribution ne sont pas fiables", () => {
    const result = computeAutopilotDecision({ ...base, attributionReliable: false, spend: 300, netRevenue: 0, completedSales: 0 });
    expect(result.decision).toBe("insufficient_data");
    expect(result.roas).toBeNull();
  });

  it("leaves recommendation unknown when attribution is unreliable, despite apparently strong metrics", () => {
    const result = computeAutopilotDecision({ ...base, attributionReliable: false, spend: 300, netRevenue: 900, completedSales: 10, historicalCustomerValue: 500 });
    expect(result.recommendation).toBeNull();
    expect(result.cpaThreshold).toBeNull();
    expect(result.recommendationReason).toContain("Blocage");
  });
  it("derives one recommendation and CPA ceiling only from adequate historical customer data", () => {
    const result = computeAutopilotDecision({ ...base, spend: 300, netRevenue: 900, completedSales: 10, historicalCustomerValue: 1000, storeCustomerCount: 30 });
    expect(result.recommendation).toBe("increase");
    expect(result.cpaThreshold).toBeGreaterThan(0);
    expect(result.recommendationReason).toContain("CPA observé");
  });
  it("fails closed for unverified, stale/future sales sync, or missing explicit limits", () => {
    const now = new Date("2026-10-18T12:00:00Z");
    const valid = { salesSyncComplete: true, salesLastSyncedAt: "2026-10-18T11:00:00Z", explicitBudgetLimit: 500, now };
    expect(canExecuteAutopilotMutation()).toBe(false);
    expect(canExecuteAutopilotMutation({ ...valid, salesSyncComplete: null })).toBe(false);
    expect(canExecuteAutopilotMutation({ ...valid, salesLastSyncedAt: "2026-10-16T11:59:59Z" })).toBe(false);
    expect(canExecuteAutopilotMutation({ ...valid, salesLastSyncedAt: "2026-10-18T13:00:00Z" })).toBe(false);
    expect(canExecuteAutopilotMutation({ ...valid, explicitBudgetLimit: null })).toBe(false);
    expect(canExecuteAutopilotMutation({ ...valid, explicitBudgetLimit: 0 })).toBe(false);
    expect(canExecuteAutopilotMutation(valid)).toBe(true);
    expect(autopilotMutationBlockReason()).toContain("limites explicites de budget");
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

  it("laisse tourner si la valeur client fiable justifie un premier achat pas encore rentabilisé", () => {
    const result = computeAutopilotDecision({
      ...base,
      spend: 300,
      netRevenue: 100,
      completedSales: 1,
      historicalCustomerValue: 1000,
      storeCustomerCount: 30,
      campaignCustomerCount: 1,
    });
    expect(result.decision).toBe("keep_running");
    expect(result.customerValueProtection).toBe(true);
    expect(result.reasons.join(" ")).toContain("Valeur client fiable");
    expect(result.reasons.join(" ")).toContain("sous le plafond");
  });

  it("garde le comportement de pause sans données client fiables", () => {
    const lowSample = computeAutopilotDecision({
      ...base,
      spend: 300,
      netRevenue: 60,
      completedSales: 1,
      historicalCustomerValue: 1000,
      storeCustomerCount: 29,
      campaignCustomerCount: 1,
    });
    const overCeiling = computeAutopilotDecision({
      ...base,
      spend: 300,
      netRevenue: 60,
      completedSales: 1,
      historicalCustomerValue: 100,
      storeCustomerCount: 30,
      campaignCustomerCount: 1,
    });
    const noCustomerIds = computeAutopilotDecision({
      ...base,
      spend: 300,
      netRevenue: 60,
      completedSales: 1,
      historicalCustomerValue: 1000,
      storeCustomerCount: 30,
      campaignCustomerCount: null,
    });
    expect(lowSample.decision).toBe("pause");
    expect(overCeiling.decision).toBe("pause");
    expect(noCustomerIds.decision).toBe("pause");
  });

  it("reste en apprentissage avant 1,5 budget quotidien même après 24h", () => {
    const result = computeAutopilotDecision({ ...base, spend: 120, netRevenue: 30, grossRevenue: 30, completedSales: 1 });
    expect(result.decision).toBe("learning");
  });
});

describe("aggregateDailyAutopilotReports", () => {
  it("garde un instantané par campagne et par jour avant de calculer les variations", () => {
    const daily = aggregateDailyAutopilotReports([
      { campaign_id: "c1", created_at: "2026-10-01T09:00:00.000Z", spend: 100, net_revenue: 20, currency: "XOF" },
      { campaign_id: "c1", created_at: "2026-10-01T23:00:00.000Z", spend: 150, net_revenue: 50, currency: "XOF" },
      { campaign_id: "c1", created_at: "2026-10-02T23:00:00.000Z", spend: 200, net_revenue: 75, currency: "XOF" },
      { campaign_id: "c2", created_at: "2026-10-01T22:00:00.000Z", spend: 20, net_revenue: 0, currency: "XOF" },
      { campaign_id: "c2", created_at: "2026-10-02T22:00:00.000Z", spend: 35, net_revenue: 20, currency: "XOF" },
      { campaign_id: "c2", created_at: "2026-10-03T22:00:00.000Z", spend: 70, net_revenue: 30, currency: "XOF" },
    ], "2026-10-02", "2026-10-02", "XOF");

    expect(daily).toEqual([{ date: "2026-10-02", spend: 65, netRevenue: 45, campaigns: 2 }]);
  });
});
