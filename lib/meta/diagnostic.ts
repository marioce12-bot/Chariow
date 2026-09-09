// Couche diagnostic déterministe (code, pas d'IA) — cf. spec "Système de diagnostic publicitaire".
// Elle calcule des métriques, les compare à une baseline propre à chaque campagne
// (jamais de seuil absolu générique) et produit des anomalies structurées avec preuves chiffrées.
// La couche IA (route /api/meta/diagnostic/analyze) reçoit uniquement ce JSON, ne recalcule rien.

export type DiagnosticStage = "audience" | "creative" | "attribution" | "offer" | "checkout" | "technical";

export type Anomaly = {
  stage: DiagnosticStage;
  severity: "low" | "medium" | "high" | "critical";
  evidence: Record<string, number>;
  comparedTo: "baseline_14j_compte";
};

export type DiagnosticReport = {
  campaignId: string;
  campaignName: string;
  period: { from: string; to: string };
  status: "ok" | "anomaly_detected";
  anomalies: Anomaly[];
};

export type DiagnosticInsightRow = {
  level: string;
  entity_id: string;
  entity_name: string | null;
  date_start: string;
  impressions: number | string | null;
  reach: number | string | null;
  clicks: number | string | null;
  spend: number | string | null;
  conversion_value: number | string | null;
};

// Ventes Chariow réelles reliées à une campagne Meta via meta_attributions.
export type DiagnosticAttributedSale = {
  meta_campaign_id: string;
  amount: number | string | null;
  status: string | null;
};

// Sans au moins 7 jours d'historique, la médiane n'est pas fiable : on ne conclut rien.
const MIN_BASELINE_DAYS = 7;
const BASELINE_WINDOW_DAYS = 14;

function num(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function severityFromRatio(ratio: number): "low" | "medium" | "high" | "critical" {
  if (ratio < 0.25) return "critical";
  if (ratio < 0.35) return "high";
  return "medium";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

type CampaignSeries = {
  entityId: string;
  name: string;
  days: Array<{ date: string; impressions: number; reach: number; clicks: number; spend: number; conversionValue: number }>;
};

function groupCampaignDays(rows: DiagnosticInsightRow[]): Map<string, CampaignSeries> {
  const campaigns = new Map<string, CampaignSeries>();
  for (const row of rows) {
    if (row.level !== "campaign" || !row.entity_id) continue;
    const impressions = num(row.impressions);
    const clicks = num(row.clicks);
    const spend = num(row.spend);
    const conversionValue = num(row.conversion_value);
    const reach = num(row.reach);
    const date = String(row.date_start ?? "");
    if (!date) continue;
    let series = campaigns.get(row.entity_id);
    if (!series) {
      series = { entityId: row.entity_id, name: String(row.entity_name ?? row.entity_id), days: [] };
      campaigns.set(row.entity_id, series);
    }
    series.days.push({ date, impressions, reach, clicks, spend, conversionValue });
  }
  for (const series of campaigns.values()) {
    series.days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  return campaigns;
}

function ctrOf(day: { impressions: number; clicks: number }): number {
  return day.impressions > 0 ? day.clicks / day.impressions : 0;
}

function frequencyOf(day: { impressions: number; reach: number }): number | null {
  return day.reach > 0 ? day.impressions / day.reach : null;
}

// Étages 1 et 2 — ciblage/audience et fatigue créative, à partir du même signal
// de baisse de CTR ; la fréquence tranche entre les deux.
function detectAudienceOrCreativeAnomaly(series: CampaignSeries): Anomaly | null {
  const current = series.days[series.days.length - 1];
  const history = series.days.slice(0, -1).slice(-BASELINE_WINDOW_DAYS);
  if (!current || history.length < MIN_BASELINE_DAYS) return null;

  const ctrBaseline = median(history.map(ctrOf));
  const ctrToday = ctrOf(current);
  if (ctrBaseline === null || ctrBaseline <= 0) return null;

  const ratio = ctrToday / ctrBaseline;
  if (ratio >= 0.5) return null;

  const frequency = frequencyOf(current);
  const evidence: Record<string, number> = {
    ctr_today: round2(ctrToday),
    ctr_baseline: round2(ctrBaseline),
    ratio: round2(ratio),
  };

  // Fatigue créative : fréquence élevée (+3 expositions par personne) — le problème
  // est la créa, pas le ciblage. Fréquence basse (<2) : le ciblage n'est pas la cause
  // d'une usure, l'audience est simplement mal ciblée.
  if (frequency !== null && frequency > 3) {
    return { stage: "creative", severity: severityFromRatio(ratio), evidence: { ...evidence, frequence: round2(frequency) }, comparedTo: "baseline_14j_compte" };
  }
  if (frequency !== null) {
    return { stage: "audience", severity: severityFromRatio(ratio), evidence: { ...evidence, frequence: round2(frequency) }, comparedTo: "baseline_14j_compte" };
  }
  return { stage: "audience", severity: severityFromRatio(ratio), evidence, comparedTo: "baseline_14j_compte" };
}

// Étage 3 — fiabilité de l'attribution : Meta rapporté vs ventes Chariow réelles.
// Calculé systématiquement car un ROAS Meta gonflé fausse toute lecture en aval.
function detectAttributionAnomaly(series: CampaignSeries, sales: DiagnosticAttributedSale[]): Anomaly | null {
  // Sans ventes Chariow réelles connues, on ne conclut rien sur l'attribution :
  // un ratio = 0 ne prouve rien, il ne fait que constater l'absence de données.
  if (!sales.length) return null;
  const spend = series.days.reduce((total, day) => total + day.spend, 0);
  const metaReportedValue = series.days.reduce((total, day) => total + day.conversionValue, 0);
  if (spend <= 0 || metaReportedValue <= 0) return null;

  const roasMeta = metaReportedValue / spend;
  const realRevenue = sales
    .filter((sale) => sale.status === "completed")
    .reduce((total, sale) => total + num(sale.amount), 0);
  const roasReel = realRevenue / spend;
  const ratio = roasReel / Math.max(roasMeta, 0.01);

  if (ratio >= 0.5) return null;
  return {
    stage: "attribution",
    severity: severityFromRatio(ratio),
    evidence: { roas_meta: round2(roasMeta), roas_reel: round2(roasReel), ratio: round2(ratio) },
    comparedTo: "baseline_14j_compte",
  };
}

export function computeCampaignDiagnostics(
  rows: DiagnosticInsightRow[],
  attributedSales: DiagnosticAttributedSale[],
  period: { from: string; to: string },
): DiagnosticReport[] {
  const campaigns = groupCampaignDays(rows);
  const salesByCampaign = new Map<string, DiagnosticAttributedSale[]>();
  for (const sale of attributedSales) {
    if (!sale.meta_campaign_id) continue;
    const list = salesByCampaign.get(sale.meta_campaign_id) ?? [];
    list.push(sale);
    salesByCampaign.set(sale.meta_campaign_id, list);
  }

  const reports: DiagnosticReport[] = [];
  for (const series of campaigns.values()) {
    const anomalies: Anomaly[] = [];
    // Étage 3 d'abord : un ROAS Meta gonflé fausse la lecture des étages en aval.
    const attributionAnomaly = detectAttributionAnomaly(series, salesByCampaign.get(series.entityId) ?? []);
    if (attributionAnomaly) anomalies.push(attributionAnomaly);

    const funnelAnomaly = detectAudienceOrCreativeAnomaly(series);
    if (funnelAnomaly) anomalies.push(funnelAnomaly);

    reports.push({
      campaignId: series.entityId,
      campaignName: series.name,
      period,
      status: anomalies.length ? "anomaly_detected" : "ok",
      anomalies,
    });
  }
  return reports.sort((a, b) => {
    if (a.status !== b.status) return a.status === "anomaly_detected" ? -1 : 1;
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    const severityA = a.anomalies[0] ? severityOrder[a.anomalies[0].severity] : 4;
    const severityB = b.anomalies[0] ? severityOrder[b.anomalies[0].severity] : 4;
    return severityA - severityB;
  });
}
