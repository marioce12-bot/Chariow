"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import type { Anomaly, DiagnosticReport } from "@/lib/meta/diagnostic";

// Intégration dashboard du système de diagnostic publicitaire :
// affiche les rapports produits par la couche déterministe (preuves chiffrées).
// L'analyse IA vit dans la section chat : le rapport est injecté dans son contexte.

const STAGE_LABELS: Record<Anomaly["stage"], string> = {
  audience: "Ciblage / audience",
  creative: "Fatigue créative",
  attribution: "Fiabilité de l'attribution",
  offer: "Offre / page produit",
  checkout: "Paiement",
  technical: "Technique (device / placement)",
};

const SEVERITY_LABELS: Record<Anomaly["severity"], string> = { critical: "Critique", high: "Élevée", medium: "Moyenne", low: "Faible" };

const EVIDENCE_LABELS: Record<string, string> = {
  ctr_today: "CTR du jour",
  ctr_baseline: "CTR baseline (14 j)",
  ratio: "Ratio vs baseline",
  frequence: "Fréquence (impressions / personne)",
  roas_meta: "ROAS rapporté Meta",
  roas_reel: "ROAS réel Chariow",
};

function formatEvidence(key: string, value: number): string {
  if (key === "roas_meta" || key === "roas_reel") return `${value.toFixed(2)}x`;
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

export function DiagnosticFunnel({ accountId }: { accountId: string | null }) {
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
        setError(data.error ?? "Le diagnostic n'a pas pu être calculé.");
        setReports([]);
        return;
      }
      setReports(data.reports ?? []);
    } catch {
      setError("Le diagnostic n'a pas pu être calculé.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run(accountId);
  }, [accountId, run]);

  const anomalyCount = reports.reduce((total, report) => total + report.anomalies.length, 0);
  const problemReports = reports.filter((report) => report.status === "anomaly_detected");

  return (
    <section className="app-card diag-section">
      <div className="card-head">
        <div>
          <span className="eyebrow">Diagnostic automatique</span>
          <h2>Où l'entonnoir bloque-t-il ?</h2>
          <p>{anomalyCount ? `${problemReports.length} campagne(s) avec anomalie détectée sur ${reports.length}.` : reports.length ? "Aucune anomalie détectée sur la période." : "Lance une synchronisation Meta Ads pour alimenter le diagnostic."}</p>
        </div>
        <div className="diag-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void run(accountId)} disabled={loading || !accountId}>{loading ? "Calcul…" : <><RefreshCw size={14} /> Relancer</>}</button>
        </div>
      </div>

      {error ? <p className="store-error" role="alert">{error}</p> : null}

      <div className="diag-reports">
        {reports.map((report) => (
          <div className={`diag-card ${report.status === "anomaly_detected" ? "diag-card-alert" : "diag-card-ok"}`} key={report.campaignId}>
            <div className="diag-card-head">
              <strong>{report.campaignName}</strong>
              {report.status === "anomaly_detected"
                ? <span className="diag-badge diag-badge-alert">{report.anomalies.length} anomalie{report.anomalies.length > 1 ? "s" : ""}</span>
                : <span className="diag-badge diag-badge-ok"><ShieldCheck size={12} /> Aucune anomalie</span>}
            </div>
            {report.anomalies.map((anomaly, index) => (
              <div className="diag-anomaly" key={`${report.campaignId}-${index}`}>
                <div className="diag-anomaly-head">
                  <span className="diag-stage">{STAGE_LABELS[anomaly.stage]}</span>
                  <span className={`diag-badge diag-sev-${anomaly.severity}`}>Gravité : {SEVERITY_LABELS[anomaly.severity]}</span>
                </div>
                <div className="diag-evidence">
                  {Object.entries(anomaly.evidence).map(([key, value]) => (
                    <span className="diag-evidence-item" key={key}><small>{EVIDENCE_LABELS[key] ?? key}</small><strong>{formatEvidence(key, value)}</strong></span>
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
