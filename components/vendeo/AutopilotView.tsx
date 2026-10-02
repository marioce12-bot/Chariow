"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Bot, PauseCircle, ShieldCheck, TrendingUp } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";

type AutopilotReport = {
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
  metrics: { daily_budget?: number; days_since_launch?: number };
  currency?: string | null;
  created_at: string;
};

type Alert = {
  id: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  status: string;
  created_at: string;
};

function formatMoney(value: number, currency: string): string {
  return `${Math.round(value).toLocaleString("fr-FR")} ${currency}`;
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
  const { t } = useI18n();
  const [reports, setReports] = useState<AutopilotReport[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [reportsRes, alertsRes] = await Promise.all([
          fetch("/api/autopilot/reports"),
          fetch("/api/alerts"),
        ]);
        const reportsData = reportsRes.ok ? await reportsRes.json() : { reports: [] };
        const alertsData = alertsRes.ok ? await alertsRes.json() : { alerts: [] };
        if (!cancelled) {
          setReports(reportsData.reports ?? []);
          setAlerts((alertsData.alerts ?? []).filter((alert: Alert) => alert.status !== "resolved"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const latest = latestPerCampaign(reports);
  const decisionMeta = (decision: AutopilotReport["decision"]) => ({
    keep_running: { label: t("autopilot.keepRunning"), icon: <TrendingUp size={14} />, tone: "#065F46" },
    pause: { label: t("autopilot.pause"), icon: <PauseCircle size={14} />, tone: "#B45309" },
    learning: { label: t("autopilot.learning"), icon: <Activity size={14} />, tone: "#3730A3" },
    insufficient_data: { label: t("autopilot.insufficient"), icon: <Activity size={14} />, tone: "#6B7280" },
  }[decision]);

  return (
    <>
      <div className="page-top">
        <div>
          <span className="eyebrow">{t("autopilot.eyebrow")}</span>
          <h1>{t("autopilot.title")}</h1>
          <p>{t("autopilot.description")}</p>
        </div>
      </div>

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

      <section className="app-card" style={{ marginBottom: 18 }}>
        <div className="card-head">
          <div><span className="eyebrow">{t("autopilot.reports")}</span><h2>{t("autopilot.tableTitle")}</h2><p>{t("autopilot.tableDescription")}</p></div>
          <Bot size={18} color="#103ef8" />
        </div>
        {loading ? (
          <p className="hint-line">{t("autopilot.loading")}</p>
        ) : latest.length === 0 ? (
          <div className="empty-state" style={{ textAlign: "left" }}>
            <strong>{t("autopilot.emptyTitle")}</strong>
            <span>{t("autopilot.emptyDescription")}</span>
          </div>
        ) : (
          <div className="report-table">
            <div className="report-table-head">
              <span>{t("autopilot.campaign")}</span><span>{t("autopilot.spend")}</span><span>{t("autopilot.sales")}</span><span>ROAS</span><span>{t("autopilot.decision")}</span>
            </div>
            {latest.map((report) => {
              const decision = decisionMeta(report.decision);
              return (
                <div key={report.id} style={{ display: "grid", gap: 10 }}>
                  <div className="report-table-row">
                    <strong>{report.campaign_title} <span style={{ fontWeight: 400, color: "#6B7280" }}>· {report.platform === "meta" ? "Meta" : "TikTok"}</span></strong>
                    <span>{formatMoney(report.spend, report.currency ?? "XOF")}</span>
                    <span>{report.completed_sales} vente{report.completed_sales > 1 ? "s" : ""} ({formatMoney(report.net_revenue, report.currency ?? "XOF")})</span>
                    <span>{report.roas === null ? "—" : `${report.roas.toFixed(2)}x`}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: decision.tone, fontWeight: 700 }}>{decision.icon}{decision.label}</span>
                  </div>
                  {report.reasons.length > 0 ? (
                    <ul style={{ margin: "0 0 4px", paddingLeft: 18, fontSize: 12, color: "#6B7280", listStyle: "disc" }}>
                      {report.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="hint-line">
        {t("autopilot.footer")}
      </p>
    </>
  );
}
