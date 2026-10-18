"use client";

import { localizeSystemMessage } from "@/lib/i18n/system-messages";
import { useCallback, useEffect, useState } from "react";
import { Info, RefreshCw, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import type { Anomaly, DiagnosticReport } from "@/lib/meta/diagnostic";

const EVIDENCE_LABELS: Record<string, string> = {
  ctr_today: "analysisExtra.funnel.clickRate", roas_meta: "analysisExtra.funnel.metaProfitability", roas_reel: "analysisExtra.funnel.verifiedProfitability",
};

function formatEvidence(key: string, value: number, en: boolean): string {
  if (key === "roas_meta" || key === "roas_reel") return `${(value * 100).toFixed(1)} %`;
  if (key === "ctr_today") return `${value.toFixed(2)} %`;
  return value.toLocaleString(en ? "en-US" : "fr-FR", { maximumFractionDigits: 2 });
}

export function DiagnosticFunnel({ accountId }: { accountId: string | null }) {
  const { locale, t } = useI18n();
  const en = locale === "en";
  const [reports, setReports] = useState<DiagnosticReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (id: string | null) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/meta/diagnostic?account_id=${encodeURIComponent(id)}`);
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? (t("analysisExtra.funnel.failed")));
        setReports([]);
        return;
      }
      setReports(data.reports ?? []);
    } catch {
      setError(t("analysisExtra.funnel.failed"));
    } finally {
      setLoading(false);
    }
  }, [en]);

  useEffect(() => { void run(accountId); }, [accountId, run]);

  const anomalyCount = reports.reduce((total, report) => total + report.anomalies.length, 0);
  const problemReports = reports.filter((report) => report.status === "anomaly_detected");
  const stageLabels: Record<Anomaly["stage"], string> = { audience: "Audience", creative: t("analysisExtra.funnel.stage.creative"), attribution: t("analysisExtra.funnel.stage.attribution"), offer: t("analysisExtra.funnel.stage.offer"), checkout: t("analysisExtra.funnel.stage.checkout"), technical: t("analysisExtra.funnel.stage.technical") };
  const severityLabels: Record<Anomaly["severity"], string> = { critical: t("analysisExtra.funnel.critical"), high: t("analysisExtra.funnel.high"), medium: t("analysisExtra.funnel.medium"), low: t("analysisExtra.funnel.low") };
  const help = t("analysisExtra.funnel.help");
  return (
    <section className="app-card diag-section">
      <div className="card-head">
        <div>
          <span className="eyebrow">{t("analysisExtra.funnel.eyebrow")}</span>
          <div className="flex items-center gap-2"><h2>{t("analysisExtra.funnel.title")}</h2><span title={help} aria-label={help}><Info size={14} /></span></div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="diag-badge">{problemReports.length} {t("analysisExtra.funnel.campaigns")}</span>
            <span className="diag-badge">{anomalyCount} {t("analysisExtra.funnel.signals")}</span>
          </div>
        </div>
        <div className="diag-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void run(accountId)} disabled={loading || !accountId}>{loading ? (t("analysisExtra.funnel.loading")) : <><RefreshCw size={14} /> {t("analysisExtra.funnel.refresh")}</>}</button>
        </div>
      </div>

      {error ? <p className="store-error" role="alert">{localizeSystemMessage(error, locale)}</p> : null}
      {!reports.length && !loading && !error ? <span className="meta-status" title={help}>{t("analysisExtra.funnel.soon")}</span> : null}

      <div className="diag-reports">
        {reports.map((report) => (
          <div className={`diag-card ${report.status === "anomaly_detected" ? "diag-card-alert" : "diag-card-ok"}`} key={report.campaignId}>
            <div className="diag-card-head">
              <strong>{report.campaignName}</strong>
              {report.status === "anomaly_detected"
                ? <span className="diag-badge diag-badge-alert">{report.anomalies.length} {t("analysisExtra.funnel.signals")}</span>
                : <span className="diag-badge diag-badge-ok"><ShieldCheck size={12} /> {t("analysisExtra.funnel.clear")}</span>}
            </div>
            {report.anomalies.map((anomaly, index) => (
              <div className="diag-anomaly" key={`${report.campaignId}-${index}`}>
                <div className="diag-anomaly-head">
                  <span className="diag-stage">{stageLabels[anomaly.stage]}</span>
                  <span className={`diag-badge diag-sev-${anomaly.severity}`}>{severityLabels[anomaly.severity]}</span>
                </div>
                <div className="diag-evidence">
                  {Object.entries(anomaly.evidence).filter(([key]) => key in EVIDENCE_LABELS).map(([key, value]) => (
                    <span className="diag-evidence-item" key={key}><small>{t(EVIDENCE_LABELS[key])}</small><strong>{formatEvidence(key, value, en)}</strong></span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
