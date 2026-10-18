"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import type { TrackingQuality } from "@/lib/tracking-quality";
import { useI18n } from "@/lib/i18n/i18n";
import "@/app/styles/tracking-quality.css";

export function TrackingQualityPanel({ storeId, periodDays }: { storeId: string | null; periodDays: number }) {
  const [quality, setQuality] = useState<TrackingQuality | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestRef = useRef<{ id: number; controller: AbortController } | null>(null);
  const sequenceRef = useRef(0);
  const { locale } = useI18n();
  const en = locale === "en";

  const load = useCallback(async (sync = false) => {
    if (!storeId) return;
    requestRef.current?.controller.abort();
    const controller = new AbortController();
    const id = ++sequenceRef.current;
    requestRef.current = { id, controller };
    const current = () => requestRef.current?.id === id;
    setBusy(true);
    setError(null);
    try {
      if (sync) {
        const syncResponse = await fetch(`/api/analytics?store_id=${encodeURIComponent(storeId)}`, { cache: "no-store", signal: controller.signal });
        if (!syncResponse.ok) throw new Error(en ? "Chariow could not be verified. Existing figures may be incomplete." : "La vérification Chariow a échoué. Les chiffres existants peuvent être incomplets.");
      }
      const to = new Date();
      const from = new Date(to.getTime() - (periodDays - 1) * 86400000);
      const response = await fetch(`/api/tracking-quality?store_id=${encodeURIComponent(storeId)}&from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`, { cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || (en ? "Tracking status unavailable." : "État du suivi indisponible."));
      if (current()) setQuality(data.quality);
    } catch (err) {
      if (current() && !controller.signal.aborted) setError(err instanceof Error ? err.message : (en ? "Tracking status unavailable." : "État du suivi indisponible."));
    } finally {
      if (current()) { requestRef.current = null; setBusy(false); }
    }
  }, [storeId, periodDays, en]);

  useEffect(() => {
    setQuality(null);
    setError(null);
    void load();
    return () => {
      if (requestRef.current) {
        requestRef.current.controller.abort();
        requestRef.current = null;
        sequenceRef.current++;
      }
    };
  }, [load]);

  if (!storeId) return null;
  const incomplete = quality?.status !== "verified";
  return <section className={`tracking-quality-panel${incomplete ? " is-incomplete" : " is-verified"}`} aria-labelledby="tracking-quality-title">
    <div className="tracking-quality-summary">
      <div className="tracking-quality-heading">
        {incomplete ? <AlertTriangle size={18} aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
        <h2 id="tracking-quality-title">{en ? (incomplete ? "Tracking to check" : "Tracking verified") : (incomplete ? "Suivi à vérifier" : "Suivi vérifié")}</h2>
      </div>
      <p className="tracking-quality-one-line">{incomplete
        ? (quality?.issues.length ? (en ? `${quality.issues.length} tracking point${quality.issues.length === 1 ? "" : "s"} to review.` : `${quality.issues.length} point${quality.issues.length === 1 ? "" : "s"} à vérifier.`) : (en ? "Checking the available sales-to-ads links." : "Vérification des liens entre ventes et pubs."))
        : (en ? "Available tracking links verified for this period." : "Liens de suivi disponibles vérifiés sur cette période.")}</p>
    </div>
    {incomplete && <p className="tracking-quality-warning"><strong>{en ? "Incomplete profitability" : "Rentabilité incomplète"}</strong><span>{en ? "Available data is not a complete profit statement." : "Les données disponibles ne constituent pas un bénéfice complet."}</span></p>}
    {error ? <p className="tracking-quality-error" role="alert">{error}</p> : null}
    {!quality && !error ? <p className="tracking-quality-loading" role="status">{en ? "Checking available evidence…" : "Vérification des données disponibles…"}</p> : null}
    {quality ? <details className="tracking-quality-details">
      <summary>{en ? `See details (${quality.issues.length})` : `Voir les détails (${quality.issues.length})`}</summary>
      {quality.issues.length ? <ul>{quality.issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul> : <p>{en ? "No tracking issues detected in available data." : "Aucun problème de suivi détecté dans les données disponibles."}</p>}
      <p className="tracking-quality-limits">{en ? "Automatic actions remain subject to validated purchase tracking and explicit budget limits." : "Les actions automatiques restent conditionnées à un suivi des achats validé et à des limites de budget explicites."}</p>
      <button type="button" className="button secondary tracking-quality-check" disabled={busy} onClick={() => void load(true)}><RefreshCw size={15} aria-hidden="true" />{busy ? (en ? "Checking…" : "Vérification…") : (en ? "Check tracking" : "Vérifier le suivi")}</button>
    </details> : <button type="button" className="button secondary tracking-quality-check" disabled={busy} onClick={() => void load(true)}><RefreshCw size={15} aria-hidden="true" />{busy ? (en ? "Checking…" : "Vérification…") : (en ? "Check tracking" : "Vérifier le suivi")}</button>}
  </section>;
}
