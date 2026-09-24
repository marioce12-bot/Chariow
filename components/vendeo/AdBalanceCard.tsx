"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Wallet, X } from "lucide-react";
import { AD_WITHDRAWAL_NETWORKS, normalizeBeninMsisdn, type AdBalanceSummary } from "@/lib/ad-balance";

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending: { label: "En cours", color: "#92400E" },
  completed: { label: "Envoyé", color: "#065F46" },
  failed: { label: "Échoué", color: "#991B1B" },
};

function formatXof(value: number) {
  return `${Math.round(value).toLocaleString("fr-FR")} XOF`;
}

/**
 * Carte "Solde publicitaire", tout en haut de la section Pub : montant mis sur la carte au
 * lancement des campagnes, SANS la commission Vendeo de 2 % (l'API ne renvoie que le net).
 * Le bouton Retirer envoie l'argent en mobile money via SasPay ; il est désactivé tant
 * qu'une campagne est active ou en cours de validation.
 */
export function AdBalanceCard({ refreshToken = 0 }: { refreshToken?: number }) {
  const [summary, setSummary] = useState<AdBalanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState<string>(AD_WITHDRAWAL_NETWORKS[0].code);
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupSubmitting, setTopupSubmitting] = useState(false);
  const [topupError, setTopupError] = useState<string | null>(null);
  const [topupUrl, setTopupUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/ad-balance", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data) { setSummary(data as AdBalanceSummary); setFailed(false); } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, refreshToken]);

  // Tant qu'un retrait est en cours, on revérifie régulièrement (le webhook SasPay le clôture).
  useEffect(() => {
    if (!summary || summary.pendingWithdrawals === 0) return;
    const interval = setInterval(() => void load(), 10_000);
    return () => clearInterval(interval);
  }, [summary, load]);

  const min = summary?.minWithdrawal ?? 2000;
  const withdrawable = summary?.withdrawable ?? 0;
  const canWithdraw = Boolean(summary) && !summary!.locked && withdrawable >= min;
  const blockedReason = !summary ? null : summary.locked
    ? "Retrait impossible tant qu'une campagne est active."
    : withdrawable < min ? (summary.reserved > 0 ? "Ce solde est réservé à une campagne payée en attente de lancement." : `Retrait possible à partir de ${formatXof(min)}.`) : null;

  function openModal() {
    setError(null);
    setNotice(null);
    setAmount("");
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!Number.isInteger(value) || value < min) return setError(`Le montant minimum est de ${formatXof(min)}.`);
    if (value > withdrawable) return setError(`Ton solde retirable est de ${formatXof(withdrawable)}.`);
    if (!normalizeBeninMsisdn(phone)) return setError("Numéro invalide : 10 chiffres, ex. 0197505050.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/ad-balance/withdraw", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: value, network, phone }) });
      const data = await res.json().catch(() => null);
      if (!res.ok && res.status !== 202) { setError(data?.error ?? "Retrait impossible."); return; }
      setOpen(false);
      setNotice(data?.uncertain ? "Retrait en cours de traitement. Le statut sera mis à jour dans quelques instants." : "Retrait lancé : l'argent arrive sur ton compte Mobile Money.");
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  function openTopup() {
    setTopupError(null);
    setTopupUrl(null);
    setTopupAmount("");
    setTopupOpen(true);
  }

  async function submitTopup(event: React.FormEvent) {
    event.preventDefault();
    setTopupError(null);
    const value = Number(topupAmount);
    if (!Number.isInteger(value) || value < 2000) return setTopupError("Le montant minimum de recharge est de 2 000 XOF.");
    setTopupSubmitting(true);
    try {
      const res = await fetch("/api/ad-balance/topup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: value }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setTopupError(data?.error ?? "Recharge impossible."); return; }
      setTopupUrl(data.payment.url);
      window.open(data.payment.url, "_blank", "noopener,noreferrer");
    } finally {
      setTopupSubmitting(false);
    }
  }

  if (failed && !summary) return null;

  return (
    <section className="app-card ad-balance-card" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: "#EEF2FF", display: "grid", placeItems: "center", flexShrink: 0 }}><Wallet size={20} color="#103ef8" /></span>
          <div style={{ minWidth: 0 }}>
            <span className="eyebrow">Solde publicitaire</span>
            {loading ? (
              <p className="hint-line" style={{ display: "flex", alignItems: "center", gap: 6 }}><Loader2 size={14} className="animate-spin" /> Chargement…</p>
            ) : (
              <strong style={{ display: "block", fontSize: 26, lineHeight: 1.15 }}>{formatXof(summary?.balance ?? 0)}</strong>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-dark" onClick={openTopup}>Recharger</button>
          <button type="button" className="btn btn-ghost" onClick={openModal} disabled={!canWithdraw} title={blockedReason ?? undefined}>Retirer</button>
        </div>
      </div>

      {summary && summary.reserved > 0 ? <p className="hint-line" style={{ marginTop: 10 }}>dont {formatXof(summary.reserved)} réservés à une campagne payée en attente de lancement.</p> : null}
      {blockedReason && !loading ? <p className="hint-line" style={{ marginTop: 10 }}>{blockedReason}</p> : null}
      {notice ? <p className="hint-line" role="status" style={{ marginTop: 10, color: "#065F46" }}>{notice}</p> : null}
      {summary && summary.recent.length > 0 ? (
        <div style={{ display: "grid", gap: 4, marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
          {summary.recent.map((row) => {
            const meta = STATUS_LABEL[row.status] ?? STATUS_LABEL.pending;
            return (
              <div key={row.id} className="hint-line" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>Retrait · {new Date(row.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
                <span><strong>{formatXof(row.amount)}</strong> · <span style={{ color: meta.color, fontWeight: 700 }}>{meta.label}</span></span>
              </div>
            );
          })}
        </div>
      ) : null}

      {open ? (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4" onClick={() => !submitting && setOpen(false)}>
          <form className="app-card" style={{ maxWidth: 420, width: "100%", display: "grid", gap: 12 }} onClick={(event) => event.stopPropagation()} onSubmit={submit}>
            <div className="card-head campaign-modal-head">
              <div><span className="eyebrow">Solde publicitaire</span><h2>Retirer de l'argent</h2></div>
              <button type="button" className="compact-icon-button" onClick={() => setOpen(false)} aria-label="Fermer" disabled={submitting}><X size={16} /></button>
            </div>
            <p className="hint-line">Disponible : <strong>{formatXof(withdrawable)}</strong></p>
            <label className="hint-line">Montant (XOF, minimum {min.toLocaleString("fr-FR")})
              <input type="number" inputMode="numeric" min={min} max={withdrawable} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} required autoFocus />
            </label>
            <button type="button" className="btn btn-ghost" style={{ justifySelf: "start" }} onClick={() => setAmount(String(Math.floor(withdrawable)))}>Tout retirer</button>
            <label className="hint-line">Réseau Mobile Money
              <select value={network} onChange={(event) => setNetwork(event.target.value)}>
                {AD_WITHDRAWAL_NETWORKS.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
              </select>
            </label>
            <label className="hint-line">Numéro (Bénin)
              <input type="tel" inputMode="tel" placeholder="0197505050" value={phone} onChange={(event) => setPhone(event.target.value)} required />
            </label>
            <p className="hint-line">Les frais de l'opérateur Mobile Money peuvent être déduits du montant reçu.</p>
            {error ? <p className="store-error" role="alert">{error}</p> : null}
            <button type="submit" className="btn btn-dark" disabled={submitting}>{submitting ? "Envoi en cours…" : "Confirmer le retrait"}</button>
          </form>
        </div>
      ) : null}

      {topupOpen ? (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4" onClick={() => !topupSubmitting && setTopupOpen(false)}>
          <form className="app-card" style={{ maxWidth: 420, width: "100%", display: "grid", gap: 12 }} onClick={(event) => event.stopPropagation()} onSubmit={submitTopup}>
            <div className="card-head campaign-modal-head">
              <div><span className="eyebrow">Solde publicitaire</span><h2>Recharger le solde</h2></div>
              <button type="button" className="compact-icon-button" onClick={() => setTopupOpen(false)} aria-label="Fermer" disabled={topupSubmitting}><X size={16} /></button>
            </div>
            {topupUrl ? (
              <div className="space-y-2">
                <p className="hint-line" style={{ color: "#92400E" }}>Termine le paiement dans l'onglet ouvert. Ton solde sera crédité automatiquement.</p>
                <a href={topupUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">Rouvrir le paiement</a>
                <button type="button" className="btn btn-dark" style={{ width: "100%" }} onClick={() => { setTopupOpen(false); void load(); }}>J'ai payé, actualiser</button>
              </div>
            ) : (
              <>
                <p className="hint-line">Montant crédité sur ton solde (2 % de commission Vendeo appliquée au paiement).</p>
                <label className="hint-line">Montant à créditer (XOF)
                  <input type="number" inputMode="numeric" min={2000} step={100} value={topupAmount} onChange={(event) => setTopupAmount(event.target.value)} required autoFocus />
                </label>
                {topupError ? <p className="store-error" role="alert">{topupError}</p> : null}
                <button type="submit" className="btn btn-dark" disabled={topupSubmitting}>{topupSubmitting ? "Création du paiement…" : "Recharger"}</button>
              </>
            )}
          </form>
        </div>
      ) : null}
    </section>
  );
}
