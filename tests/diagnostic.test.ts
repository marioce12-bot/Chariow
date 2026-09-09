import { describe, expect, it } from "vitest";
import { computeCampaignDiagnostics, median, type DiagnosticInsightRow } from "@/lib/meta/diagnostic";

const PERIOD = { from: "2026-08-01", to: "2026-08-20" };

// Génère `historyDays` jours stables (ctr 0.02, reach = impressions / fréquence) puis
// `currentDays` jours avec le ctr fourni.
function insights(ctrCurrent: number, options: { historyDays?: number; frequency?: number; historyCtr?: number } = {}): DiagnosticInsightRow[] {
  const { historyDays = 14, frequency = 2.5, historyCtr = 0.02 } = options;
  const rows: DiagnosticInsightRow[] = [];
  for (let i = 0; i < historyDays; i++) {
    const day = `2026-08-${String(i + 1).padStart(2, "0")}`;
    rows.push({ level: "campaign", entity_id: "cmp_1", entity_name: "Campagne test", date_start: day, impressions: 10000, reach: Math.round(10000 / frequency), clicks: Math.round(10000 * historyCtr), spend: 5000, conversion_value: 12000 });
  }
  rows.push({ level: "campaign", entity_id: "cmp_1", entity_name: "Campagne test", date_start: "2026-08-20", impressions: 10000, reach: Math.round(10000 / frequency), clicks: Math.round(10000 * ctrCurrent), spend: 5000, conversion_value: 12000 });
  return rows;
}

describe("Diagnostic entonnoir publicitaire", () => {
  it("calcule la médiane classique", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([])).toBeNull();
  });

  it("statut ok quand le CTR du jour suit la baseline", () => {
    const [report] = computeCampaignDiagnostics(insights(0.02), [], PERIOD);
    expect(report.status).toBe("ok");
    expect(report.anomalies).toHaveLength(0);
  });

  it("étage 1 — CTR sous 50% de la baseline médiane 14j → anomalie audience", () => {
    const [report] = computeCampaignDiagnostics(insights(0.005), [], PERIOD);
    expect(report.status).toBe("anomaly_detected");
    const anomaly = report.anomalies.find((item) => item.stage === "audience");
    expect(anomaly).toBeDefined();
    expect(anomaly?.evidence.ctr_baseline).toBe(0.02);
    expect(anomaly?.evidence.ratio).toBeLessThan(0.5);
    expect(anomaly?.comparedTo).toBe("baseline_14j_compte");
  });

  it("étage 2 — CTR en baisse + fréquence > 3 → fatigue créative (creative), pas audience", () => {
    const [report] = computeCampaignDiagnostics(insights(0.005, { frequency: 4 }), [], PERIOD);
    expect(report.anomalies.some((item) => item.stage === "creative")).toBe(true);
    expect(report.anomalies.some((item) => item.stage === "audience")).toBe(false);
  });

  it("étage 2 — CTR en baisse + fréquence < 2 → problème de ciblage (audience)", () => {
    const [report] = computeCampaignDiagnostics(insights(0.005, { frequency: 1.5 }), [], PERIOD);
    const audience = report.anomalies.find((item) => item.stage === "audience");
    expect(audience).toBeDefined();
    expect(audience?.evidence.frequence).toBe(1.5);
    expect(report.anomalies.some((item) => item.stage === "creative")).toBe(false);
  });

  it("étage 3 — ROAS réel < 50% du ROAS Meta → sur-attribution Meta", () => {
    const rows = insights(0.02, { historyCtr: 0.02 }); // dépense 105 000, Meta rapporte 252 000 → roasMeta ≈ 2.4
    const sales = [{ meta_campaign_id: "cmp_1", amount: 20000, status: "completed" }]; // roasReel ≈ 0.19
    const [report] = computeCampaignDiagnostics(rows, sales, PERIOD);
    const attribution = report.anomalies.find((item) => item.stage === "attribution");
    expect(attribution).toBeDefined();
    expect(attribution?.evidence.roas_meta).toBeGreaterThan(0);
    expect(attribution?.evidence.ratio).toBeLessThan(0.5);
    expect(report.anomalies.some((item) => item.stage === "audience")).toBe(false);
  });

  it("étage 3 — pas d'anomalie si le revenu réel suit Meta", () => {
    const rows = insights(0.02, { historyCtr: 0.02 });
    const sales = [{ meta_campaign_id: "cmp_1", amount: 150000, status: "completed" }];
    const [report] = computeCampaignDiagnostics(rows, sales, PERIOD);
    expect(report.status).toBe("ok");
  });

  it("les ventes remboursées/échouées ne comptent pas dans le revenu réel", () => {
    const rows = insights(0.02, { historyCtr: 0.02 });
    const sales = [
      { meta_campaign_id: "cmp_1", amount: 150000, status: "failed" },
      { meta_campaign_id: "cmp_1", amount: 150000, status: "refunded" },
    ];
    const [report] = computeCampaignDiagnostics(rows, sales, PERIOD);
    const attribution = report.anomalies.find((item) => item.stage === "attribution");
    expect(attribution).toBeDefined();
  });

  it("pas de conclusion sans historique suffisant (< 7 jours de baseline)", () => {
    const rows = insights(0.005, { historyDays: 3 });
    const [report] = computeCampaignDiagnostics(rows, [], PERIOD);
    expect(report.status).toBe("ok");
    expect(report.anomalies).toHaveLength(0);
  });

  it("plusieurs campagnes sont diagnostiquées indépendamment, anomalies d'abord", () => {
    const rows: DiagnosticInsightRow[] = [];
    for (let i = 0; i < 14; i++) {
      const day = `2026-08-${String(i + 1).padStart(2, "0")}`;
      rows.push({ level: "campaign", entity_id: "cmp_ok", entity_name: "Stable", date_start: day, impressions: 10000, reach: 4000, clicks: 200, spend: 5000, conversion_value: 12000 });
      rows.push({ level: "campaign", entity_id: "cmp_ko", entity_name: "En baisse", date_start: day, impressions: 10000, reach: 10000, clicks: 200, spend: 5000, conversion_value: 12000 });
    }
    for (const campaignId of ["cmp_ok", "cmp_ko"]) {
      rows.push({ level: "campaign", entity_id: campaignId, entity_name: campaignId, date_start: "2026-08-20", impressions: 10000, reach: 4000, clicks: campaignId === "cmp_ko" ? 50 : 200, spend: 5000, conversion_value: 12000 });
    }
    const reports = computeCampaignDiagnostics(rows, [], PERIOD);
    expect(reports).toHaveLength(2);
    expect(reports[0].campaignId).toBe("cmp_ko");
    expect(reports[0].status).toBe("anomaly_detected");
    expect(reports[1].status).toBe("ok");
  });
});
