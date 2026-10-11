"use client";

import { useCallback, useEffect, useState } from "react";
import { Info, RefreshCw, ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import type { Anomaly, DiagnosticReport } from "@/lib/meta/diagnostic";

const EVIDENCE_LABELS: Record<string, { fr: string; en: string }> = {
  ctr_today: { fr: "Taux de clic", en: "Click-through rate" },
  roas_meta: { fr: "Rentabilité déclarée Meta", en: "Meta-reported profitability" },
  roas_reel: { fr: "Rentabilité vérifiée", en: "Verified profitability" },
};

function formatEvidence(key: string, value: number, en: boolean): string {
  if (key === "roas_meta" || key === "roas_reel") return `${(value * 100).toFixed(1)} %`;
  if (key === "ctr_today") return `${value.toFixed(2)} %`;
  return value.toLocaleString(en ? "en-US" : "fr-FR", { maximumFractionDigits: 2 });
}

export function DiagnosticFunnel({ accountId }: { accountId: string | null }) {
  const { locale } = useI18n();
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
        setError(data.error ?? (en ? "Diagnostic failed" : "Échec du diagnostic"));
        setReports([]);
        return;
      }
      setReports(data.reports ?? []);
    } catch {
      setError(en ? "Diagnostic failed" : "Échec du diagnostic");
    } finally {
      setLoading(false);
    }
  }, [en]);

  useEffect(() => { void run(accountId); }, [accountId, run]);

  const anomalyCount = reports.reduce((total, report) => total + report.anomalies.length, 0);
  const problemReports = reports.filter((report) => report.status === "anomaly_detected");
  const stageLabels: Record<Anomaly["stage"], string> = en
    ? { audience: "Audience", creative: "Creative", attribution: "Sales tracking", offer: "Offer", checkout: "Checkout", technical: "Technical" }
    : { audience: "Audience", creative: "Création", attribution: "Suivi des ventes", offer: "Offre", checkout: "Paiement", technical: "Technique" };
  const severityLabels: Record<Anomaly["severity"], string> = en
    ? { critical: "Critical", high: "High", medium: "Medium", low: "Low" }
    : { critical: "Critique", high: "Élevée", medium: "Moyenne", low: "Faible" };
  const help = en
    ? "Evidence is based on synchronized Meta data. Verified profitability uses Chariow sales linked to campaigns launched from Vendeo."
    : "Les preuves reposent sur les données Meta synchronisées. La rentabilité vérifiée utilise les ventes Chariow reliées aux campagnes lancées depuis Vendeo.";

  return (
    <section className="app-card diag-section">
      <div className="card-head">
        <div>
          <span className="eyebrow">{en ? "Campaign signals" : "Signaux campagnes"}</span>
          <div className="flex items-center gap-2"><h2>{en ? "Campaign diagnosis" : "Diagnostic campagnes"}</h2><span title={help} aria-label={help}><Info size={14} /></span></div>
          <div className="flex flex-wrap gap-2 mt-2">
            <span className="diag-badge">{problemReports.length} {en ? "campaigns" : "campagnes"}</span>
            <span className="diag-badge">{anomalyCount} {en ? "signals" : "signaux"}</span>
          </div>
        </div>
        <div className="diag-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void run(accountId)} disabled={loading || !accountId}>{loading ? (en ? "Loading…" : "Calcul…") : <><RefreshCw size={14} /> {en ? "Refresh" : "Actualiser"}</>}</button>
        </div>
      </div>

      {error ? <p className="store-error" role="alert">{error}</p> : null}
      {!reports.length && !loading && !error ? <span className="meta-status" title={help}>{en ? "Coming soon" : "Bientôt"}</span> : null}

      <div className="diag-reports">
        {reports.map((report) => (
          <div className={`diag-card ${report.status === "anomaly_detected" ? "diag-card-alert" : "diag-card-ok"}`} key={report.campaignId}>
            <div className="diag-card-head">
              <strong>{report.campaignName}</strong>
              {report.status === "anomaly_detected"
                ? <span className="diag-badge diag-badge-alert">{report.anomalies.length} {en ? "signals" : "signaux"}</span>
                : <span className="diag-badge diag-badge-ok"><ShieldCheck size={12} /> {en ? "Clear" : "Sain"}</span>}
            </div>
            {report.anomalies.map((anomaly, index) => (
              <div className="diag-anomaly" key={`${report.campaignId}-${index}`}>
                <div className="diag-anomaly-head">
                  <span className="diag-stage">{stageLabels[anomaly.stage]}</span>
                  <span className={`diag-badge diag-sev-${anomaly.severity}`}>{severityLabels[anomaly.severity]}</span>
                </div>
                <div className="diag-evidence">
                  {Object.entries(anomaly.evidence).filter(([key]) => key in EVIDENCE_LABELS).map(([key, value]) => (
                    <span className="diag-evidence-item" key={key}><small>{EVIDENCE_LABELS[key][en ? "en" : "fr"]}</small><strong>{formatEvidence(key, value, en)}</strong></span>
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
