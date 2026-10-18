import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n/translate";
import type { Locale } from "@/lib/i18n/locales";

let activeLocale: Locale = "fr";
vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({ locale: activeLocale, t: (key: string, vars?: Record<string, string | number>) => translate(activeLocale, key, vars) }),
}));

import { AutopilotReportCard, type AutopilotReport } from "@/components/vendeo/AutopilotView";
import { explainAutopilotMessage } from "@/lib/i18n/autopilot-messages";
import { autopilotMutationBlockReason, computeAutopilotDecision } from "@/lib/autopilot";

const baseReport: AutopilotReport = {
  id: "r-1", campaign_id: "c-1", campaign_title: "Campagne test", platform: "meta",
  period_from: "2026-01-01", period_to: "2026-01-07", spend: 1250, gross_revenue: 2500,
  net_revenue: 2200, completed_sales: 2, impressions: 1000, clicks: 42, roas: 1.76,
  cac: 625, decision: "keep_running", reasons: ["Rentable : 2 200 de ventes nettes pour 1 250 de pub."],
  metrics: { daily_budget: 500, days_since_launch: 8 }, currency: "XOF", created_at: "2026-01-08T00:00:00Z",
};
const render = (overrides: Partial<AutopilotReport> = {}) => renderToStaticMarkup(createElement(AutopilotReportCard, { report: { ...baseReport, ...overrides } }));

beforeEach(() => { activeLocale = "fr"; });

describe("AutopilotReportCard static presentation", () => {
  it("renders report data, currency and zero values, and localizes unavailable ROAS in French and English", () => {
    let html = render({ spend: 0, net_revenue: 0, completed_sales: 0, roas: null, currency: "EUR", reasons: [] });
    expect(html).toContain("0 EUR");
    expect(html).toContain("0 vente");
    expect(html).toContain("Non disponible");
    expect(html).toContain("Campagne test");
    activeLocale = "en";
    html = render({ spend: 0, net_revenue: 0, completed_sales: 0, roas: null, currency: "EUR", reasons: [] });
    expect(html).toContain("Not available");
    expect(html).toContain("0 EUR");
  });

  it.each([
    ["keep_running", "Laisser tourner"], ["pause", "Mise en pause"], ["learning", "Apprentissage"], ["insufficient_data", "Pas assez de données"],
  ] as const)("shows decision %s", (decision, label) => {
    expect(render({ decision })).toContain(label);
  });

  it.each([["continue", "continuer"], ["reduce", "réduire"], ["increase", "augmenter"]] as const)("shows recommendation %s", (recommendation, action) => {
    expect(render({ recommendation, recommendation_reason: "raison explicitement conservée" })).toContain(action);
  });

  it("keeps mutation reason visible without recommendation_reason and labels an unknown recommendation when its reason exists", () => {
    const html = render({ recommendation: null, recommendation_reason: undefined, mutation_block_reason: "Blocage inconnu à conserver" });
    expect(html).toContain("Blocage inconnu à conserver");
    expect(render({ recommendation: null, recommendation_reason: "motif inconnu" })).toContain("Pas encore de conseil fiable");
    expect(html).not.toContain("raison explicitement conservée");
  });

  it("retains insufficient-data reasons and a zero CPA threshold, without direct ad mutation controls", () => {
    const html = render({ decision: "insufficient_data", recommendation: null, recommendation_reason: "Blocage : données fiables et suffisamment mûres indisponibles ; recommandation inconnue.", cpa_threshold: 0, reasons: ["raison insuffisante"] });
    expect(html).toContain("raison insuffisante");
    expect(html).toContain("0 XOF");
    expect(html).toContain("Trop tôt pour juger la rentabilité");
    expect(html).not.toMatch(/<input\b|<select\b/i);
    expect(html).not.toContain("/launch");
  });

  it("does not expose implementation jargon in known French or English explanations and preserves unknown text", () => {
    const known = "Mutation automatique bloquée : synchronisation des ventes absente, future ou vieille de plus de 48 h.";
    for (const locale of ["fr", "en"] as const) {
      const message = explainAutopilotMessage(known, locale);
      expect(message).not.toMatch(/Mutation|serveur|attribution/i);
      expect(message).toContain(locale === "fr" ? "48 h" : "48 hours");
    }
    const unknown = "Message totalement inconnu";
    expect(explainAutopilotMessage(unknown, "fr")).toBe(unknown);
    expect(explainAutopilotMessage(unknown, "en")).toBe(unknown);
  });

  it("uses decision and mutation-block source strings and blocks missing, future, and stale sync", () => {
    const decision = computeAutopilotDecision({ spend: 100, netRevenue: 0, grossRevenue: 0, completedSales: 0, daysSinceLaunch: 1, dailyBudget: 100, attributionReliable: false });
    expect(decision.reasons[0]).toBe("Suivi des achats ou attribution à cette campagne non confirmé : aucune pause automatique ne sera déclenchée.");
    expect(explainAutopilotMessage(decision.reasons[0], "fr")).toContain("ne la mettra pas en pause");
    const now = new Date("2026-01-10T12:00:00Z");
    const block = autopilotMutationBlockReason({ salesSyncComplete: true, salesLastSyncedAt: "2026-01-08T12:00:00Z", explicitBudgetLimit: 10, now });
    expect(block).toBeNull();
    const syncReason = autopilotMutationBlockReason({ salesSyncComplete: true, salesLastSyncedAt: "2026-01-10T12:01:00Z", explicitBudgetLimit: 10, now });
    expect(syncReason).toContain("future");
    expect(explainAutopilotMessage(syncReason!, "en")).toContain("dated in the future");
    const staleReason = autopilotMutationBlockReason({ salesSyncComplete: true, salesLastSyncedAt: "2026-01-08T11:59:59Z", explicitBudgetLimit: 10, now });
    expect(staleReason).toContain("plus de 48 h");
    expect(explainAutopilotMessage(staleReason!, "fr")).toContain("plus de 48 h");
  });
});
