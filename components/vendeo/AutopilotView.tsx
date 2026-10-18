"use client";
import { localizeSystemMessage } from "@/lib/i18n/system-messages";

import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, Bot, PauseCircle, ShieldCheck, TrendingUp } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import "./autopilot.css";
import { AutopilotBudgetLimit } from "./AutopilotBudgetLimit";
import { explainAutopilotMessage } from "@/lib/i18n/autopilot-messages";

export type AutopilotReport = {
  id: string;
  campaign_id: string;
  campaign_title: string;
  platform: "meta" | "tiktok";
  period_from: string;
  period_to: string;
  spend: number;
  gross_revenue: number;
  net_revenue: number;
  completed_sales: number;
  impressions: number;
  clicks: number;
  roas: number | null;
  cac: number | null;
  decision: "keep_running" | "pause" | "learning" | "insufficient_data";
  reasons: string[];
  recommendation?: "continue" | "reduce" | "increase" | null;
  recommendation_reason?: string;
  cpa_threshold?: number | null;
  mutation_block_reason?: string | null;
  budget_block_reason?: string | null;
  metrics: { daily_budget?: number; days_since_launch?: number };
  currency?: string | null;
  created_at: string;
};

type AutopilotCampaign = { id: string; title: string; platform: "meta" | "tiktok"; autopilot_enabled: boolean };

type Alert = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  status: string;
  created_at: string;
};

function formatMoney(value: number, currency: string, locale: "fr" | "en"): string {
  return `${Math.round(value).toLocaleString(locale === "en" ? "en-US" : "fr-FR")} ${currency}`;
}

// Regroupe les rapports par campagne en ne gardant que le plus récent par campagne,
// pour afficher l'état actuel de chaque campagne suivie.
function latestPerCampaign(reports: AutopilotReport[]): AutopilotReport[] {
  const byCampaign = new Map<string, AutopilotReport>();
  for (const report of reports) {
    if (!byCampaign.has(report.campaign_id) || new Date(report.created_at) > new Date(byCampaign.get(report.campaign_id)!.created_at)) {
      byCampaign.set(report.campaign_id, report);
    }
  }
  return Array.from(byCampaign.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function AutopilotView() {
  const { t, locale } = useI18n();
  const [reports, setReports] = useState<AutopilotReport[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [campaigns, setCampaigns] = useState<AutopilotCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadData = useCallback(async (cancelled: () => boolean) => {
    setLoading(true);
    setError(null);
    try {
      const [reportsRes, alertsRes] = await Promise.all([
        fetch("/api/autopilot/reports"),
        fetch("/api/alerts"),
      ]);
      if (!reportsRes.ok) throw new Error(t("interfaceExtra.reportsUnavailable", { status: reportsRes.status }));
      if (!alertsRes.ok) throw new Error(t("interfaceExtra.alertsUnavailable", { status: alertsRes.status }));
      const [reportsData, alertsData] = await Promise.all([reportsRes.json(), alertsRes.json()]);
      if (!cancelled()) {
        setReports(reportsData.reports ?? []);
        setCampaigns(reportsData.campaigns ?? []);
        setAlerts((alertsData.alerts ?? []).filter((alert: Alert) => alert.status !== "resolved"));
      }
    } catch (cause) {
      if (!cancelled()) setError(cause instanceof Error ? cause.message : t("interfaceExtra.reportsError"));
    } finally {
      if (!cancelled()) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    void loadData(() => cancelled);
    return () => { cancelled = true; };
  }, [loadData, reloadKey]);

  const latest = latestPerCampaign(reports);
  const withoutReports = campaigns.filter((campaign) => !latest.some((report) => report.campaign_id === campaign.id));
  const updateEnabled = (id: string, enabled: boolean) => setCampaigns((current) => current.map((campaign) => campaign.id === id ? { ...campaign, autopilot_enabled: enabled } : campaign));


  return (
    <div className="autopilot-view">
      <div className="page-top">
        <div>
          <span className="eyebrow">{t("autopilot.eyebrow")}</span>
          <h1>{t("autopilot.title")}</h1>
          <p>{t("autopilot.description")}</p>
        </div>
      </div>

      <aside className="autopilot-safety" aria-label={t("autopilot.safetyTitle")}>
        <ShieldCheck size={20} aria-hidden="true" />
        <div><strong>{t("autopilot.safetyTitle")}</strong><p>{t("autopilot.safetyDescription")}</p></div>
      </aside>

      {alerts.length > 0 ? (
        <section className="app-card" style={{ marginBottom: 18 }}>
          <div className="card-head">
            <div><span className="eyebrow">{t("autopilot.notifications")}</span><h2>{t("autopilot.latestDecisions")}</h2></div>
            <AlertTriangle size={18} color="#d28b3d" />
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {alerts.slice(0, 10).map((alert) => (
              <div key={alert.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", borderRadius: 10, background: alert.severity === "critical" ? "#FEF2F2" : alert.severity === "warning" ? "#FFFBEB" : "#EEF2FF" }}>
                <span style={{ color: alert.severity === "critical" ? "#991B1B" : alert.severity === "warning" ? "#92400E" : "#3730A3", flexShrink: 0, marginTop: 2 }}>
                  {alert.severity === "critical" ? <AlertTriangle size={16} /> : alert.severity === "warning" ? <PauseCircle size={16} /> : <ShieldCheck size={16} />}
                </span>
                <div>
                  <strong style={{ fontSize: 13 }}>{alert.title}</strong>
                  <p className="hint-line" style={{ margin: "2px 0 0" }}>{alert.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="app-card autopilot-reports" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div><span className="eyebrow">{t("autopilot.reports")}</span><h2>{t("autopilot.tableTitle")}</h2><p>{t("autopilot.tableDescription")}</p></div>
          <Bot size={18} color="#103ef8" />
        </div>
        {loading ? (
          <p className="hint-line" role="status">{t("interfaceExtra.reportsLoading")}</p>
        ) : error ? (
          <div role="alert" style={{ padding: 14, borderRadius: 10, background: "#FEF2F2", color: "#991B1B" }}>
            <strong>{t("interfaceExtra.reportsFailed")}</strong>
            <p style={{ margin: "4px 0 10px" }}>{localizeSystemMessage(error, locale)}</p>
            <button type="button" onClick={() => setReloadKey((key) => key + 1)}>{t("adminExtra.admin.retry")}</button>
          </div>
        ) : latest.length === 0 && withoutReports.length === 0 ? (
          <div className="empty-state" style={{ textAlign: "left" }}>
            <strong>{t("autopilot.emptyTitle")}</strong>
            <span>{t("autopilot.emptyDescription")}</span>
          </div>
        ) : (
          <div className="autopilot-report-list">
            {latest.map((report) => <AutopilotReportCard key={report.id} report={report} autopilotEnabled={campaigns.find((campaign) => campaign.id === report.campaign_id)?.autopilot_enabled ?? false} onEnabledChange={(enabled) => updateEnabled(report.campaign_id, enabled)} onBudgetSaved={() => setReloadKey((key) => key + 1)} />)}
            {withoutReports.map((campaign) => <article className="autopilot-campaign" key={campaign.id}><div className="autopilot-campaign-head"><div><span className="autopilot-platform">{campaign.platform === "meta" ? "Meta" : "TikTok"}</span><h3>{campaign.title}</h3></div></div><p className="hint-line">{t("autopilot.noReportYet")}</p><AutopilotBudgetLimit campaignId={campaign.id} enabled={campaign.autopilot_enabled} onEnabledChange={(enabled) => updateEnabled(campaign.id, enabled)} /></article>)}
          </div>
        )}
      </section>

      <p className="autopilot-footer"><ShieldCheck size={14} aria-hidden="true" />{t("autopilot.footer")}</p>
    </div>
  );
}

// Presentation only: all decisions, recommendations and blockers come from the report.
export function AutopilotReportCard({ report, autopilotEnabled = false, onEnabledChange, onBudgetSaved }: { report: AutopilotReport; autopilotEnabled?: boolean; onEnabledChange?: (enabled: boolean) => void; onBudgetSaved?: () => void }) {
  const { t, locale } = useI18n();
  const decisionMeta = (decision: AutopilotReport["decision"]) => ({
    keep_running: { label: t("autopilot.keepRunning"), icon: <TrendingUp size={14} />, tone: "#065F46" },
    pause: { label: t("autopilot.pause"), icon: <PauseCircle size={14} />, tone: "#B45309" },
    learning: { label: t("autopilot.learning"), icon: <Activity size={14} />, tone: "#3730A3" },
    insufficient_data: { label: t("autopilot.insufficient"), icon: <Activity size={14} />, tone: "#6B7280" },
  }[decision]);
  const decision = decisionMeta(report.decision);
  const budgetCodes = ["NO_BUDGET_LIMIT", "CURRENCY_UNAVAILABLE", "CURRENCY_MISMATCH", "BUDGET_EXCEEDED"];
  const visibleBlockReason = budgetCodes.includes(report.mutation_block_reason ?? "") ? (autopilotEnabled ? report.budget_block_reason : null) : report.mutation_block_reason;
  return (
    <article className="autopilot-campaign" aria-labelledby={`autopilot-campaign-${report.id}`}>
      <div className="autopilot-campaign-head">
        <div><span className="autopilot-platform">{report.platform === "meta" ? "Meta" : "TikTok"}</span><h3 id={`autopilot-campaign-${report.id}`}>{report.campaign_title}</h3></div>
        <span className="autopilot-decision" style={{ color: decision.tone }}>{decision.icon}{decision.label}</span>
      </div>
      <dl className="autopilot-metrics">
        <div><dt>{t("autopilot.spend")}</dt><dd>{formatMoney(report.spend, report.currency ?? "XOF", locale)}</dd></div>
        <div><dt>{t("autopilot.sales")}</dt><dd>{report.completed_sales} {t("analysisExtra.saleOne")}{report.completed_sales > 1 ? "s" : ""}<small>{formatMoney(report.net_revenue, report.currency ?? "XOF", locale)}</small></dd></div>
        <div><dt>{t("autopilot.profitability")}</dt><dd>{report.roas === null ? t("autopilot.notAvailable") : `${(report.roas * 100).toFixed(1)} %`}</dd></div>
      </dl>
      <AutopilotBudgetLimit campaignId={report.campaign_id} enabled={autopilotEnabled} onEnabledChange={onEnabledChange} onBudgetSaved={onBudgetSaved} />
      <div className="autopilot-notes">
        {report.recommendation_reason ? (
          <div className={`autopilot-note${report.mutation_block_reason || !report.recommendation ? " autopilot-note-blocked" : ""}`}>
            <strong>{report.recommendation ? t("autopilot.recommendation", { action: report.recommendation === "continue" ? t("interfaceExtra.continue") : report.recommendation === "reduce" ? t("interfaceExtra.reduce") : t("interfaceExtra.increase") }) : t("autopilot.unknownRecommendation")}</strong>
            <p>{explainAutopilotMessage(report.recommendation_reason, locale)}</p>
            {report.cpa_threshold != null ? <p>{t("autopilot.cpaThreshold", { amount: formatMoney(report.cpa_threshold, report.currency || "", locale) })}</p> : null}
          </div>
        ) : null}
        {visibleBlockReason ? <div className="autopilot-note autopilot-note-blocked"><strong>{t("autopilot.actionBlocked")}</strong><p>{explainAutopilotMessage(visibleBlockReason, locale)}</p></div> : null}
        {report.decision === "insufficient_data" ? (
          <div className="autopilot-note">
            <strong>{t("autopilot.insufficientData")}</strong>
            <p>{t("autopilot.insufficientExplanation")}</p>
            {report.reasons.length > 0 ? <ul>{report.reasons.map((reason) => <li key={reason}>{explainAutopilotMessage(reason, locale)}</li>)}</ul> : null}
          </div>
        ) : report.reasons.length > 0 ? (
          <ul className="autopilot-reasons">{report.reasons.map((reason) => <li key={reason}>{explainAutopilotMessage(reason, locale)}</li>)}</ul>
        ) : null}
      </div>
    </article>
  );
}
