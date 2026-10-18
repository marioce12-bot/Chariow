"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import type { TrackingQuality } from "@/lib/tracking-quality";
import { useI18n } from "@/lib/i18n/i18n";

export function TrackingQualityPanel({ storeId, periodDays }: { storeId: string | null; periodDays: number }) {
  const [quality, setQuality] = useState<TrackingQuality | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { locale } = useI18n();
  const en = locale === "en";
  async function load(sync = false) {
    if (!storeId) return;
    setBusy(true); setError(null);
    try {
      if (sync) {
        const response = await fetch(`/api/analytics?store_id=${encodeURIComponent(storeId)}`, { cache: "no-store" });
        if (!response.ok) throw new Error(en ? "Chariow could not be verified. Existing figures may be incomplete." : "La vérification Chariow a échoué. Les chiffres existants peuvent être incomplets.");
      }
      const to = new Date();
      const from = new Date(to.getTime() - (periodDays - 1) * 86400000);
      const response = await fetch(`/api/tracking-quality?store_id=${encodeURIComponent(storeId)}&from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "État du suivi indisponible.");
      setQuality(data.quality);
    } catch (err) { setQuality(null); setError(err instanceof Error ? err.message : "État du suivi indisponible."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, [storeId, periodDays]);
  if (!storeId) return null;
  const incomplete = quality?.status !== "verified";
  return <section className="app-card" aria-labelledby="tracking-quality-title" style={{ borderColor: incomplete ? "#f4d394" : "#b5dec9" }}>
    <div className="card-head" style={{ gap: 12, flexWrap: "wrap" }}>
      <div><h2 id="tracking-quality-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>{incomplete ? <AlertTriangle size={19} /> : <ShieldCheck size={19} />}{en ? "Tracking reliability" : "Fiabilité du suivi"}</h2>
      <p className="hint-line">{en ? "Chariow → product → paid sale → campaign" : "Chariow → produit → vente payée → campagne"}</p></div>
      <button type="button" className="button secondary" disabled={busy} onClick={() => void load(true)} style={{ display: "flex", gap: 6, alignItems: "center" }}><RefreshCw size={15} />{busy ? (en ? "Checking…" : "Vérification…") : (en ? "Check tracking" : "Vérifier le suivi")}</button>
    </div>
    {error ? <p role="alert">{error}</p> : !quality ? <p role="status">{en ? "Checking available evidence…" : "Vérification des données disponibles…"}</p> : <>
      <strong>{incomplete ? (en ? "Incomplete data — do not treat these figures as a complete profit statement." : "Données incomplètes — ces chiffres ne constituent pas un bénéfice complet.") : (en ? "Available links verified for this period." : "Liens disponibles vérifiés sur cette période.")}</strong>
      {quality.issues.length ? <ul style={{ paddingLeft: 20, lineHeight: 1.65, marginTop: 10 }}>{quality.issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul> : null}
      <p className="hint-line" style={{ marginBottom: 0 }}>{en ? "Automatic actions remain subject to validated purchase tracking and explicit budget limits." : "Les actions automatiques restent conditionnées à un suivi des achats validé et à des limites de budget explicites."}</p>
    </>}
  </section>;
}
