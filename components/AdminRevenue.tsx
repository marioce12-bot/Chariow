"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { fetchAdminJson } from "@/lib/admin-fetch";
import type { RevenueSummary } from "@/lib/admin-revenue";
import "./admin-revenue.css";
export function AdminRevenue({ refreshRevision = 0 }: { refreshRevision?: number }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    setRevenue(null); setState("loading");
    fetchAdminJson("/api/admin/revenue").then((payload) => {
      if (!payload.revenue || typeof payload.revenue.complete !== "boolean") throw new Error();
      if (current) { setRevenue(payload.revenue); setState("ready"); }
    }).catch(() => { if (current) setState("error"); });
    return () => { current = false; };
  }, [refreshRevision, retry]);
  const money = (value: number | null | undefined) => value == null ? "—" : `${value.toLocaleString(en ? "en-US" : "fr-FR")} XOF`;
  const date = (value: string) => new Date(value).toLocaleString(en ? "en-GB" : "fr-FR", { timeZone: "UTC", dateStyle: "short", timeStyle: "short" });
  return <section className="admin-card admin-revenue" aria-label={en ? "Vendeo SaaS revenue" : "Chiffre d’affaires SaaS Vendeo"}>
    <div className="admin-card-head"><div><h2>{en ? "Vendeo SaaS revenue" : "Chiffre d’affaires SaaS Vendeo"}</h2><p className="admin-help">{en ? "Recorded successful payments only · not store sales" : "Paiements réussis enregistrés uniquement · hors ventes des boutiques"}</p></div></div>
    {state === "loading" && <p role="status">{en ? "Loading revenue…" : "Chargement des revenus…"}</p>}
    {state === "error" && <p role="alert">{en ? "Revenue unavailable. No estimated total is shown." : "Revenus indisponibles. Aucun total estimé n’est affiché."} <button className="admin-btn admin-btn-soft" onClick={() => setRetry(v => v + 1)}>{en ? "Retry" : "Réessayer"}</button></p>}
    {revenue && <>
      <p className="admin-help">{en ? "All recorded history" : "Tout l’historique enregistré"}{revenue.firstRecordedAt ? ` · ${date(revenue.firstRecordedAt)} → ${date(revenue.asOf)} UTC` : ` · ${en ? "through" : "jusqu’au"} ${date(revenue.asOf)} UTC`}</p>
      {!revenue.complete && <p role="alert">{en ? `${revenue.unresolved} record(s) lack reliable payment, amount, currency or refund evidence. Totals are withheld.` : `${revenue.unresolved} écriture(s) sans preuve fiable de paiement, montant, devise ou remboursement. Les totaux ne sont pas affichés.`}</p>}
      <div className="admin-revenue-grid">
        {[[en ? "Subscriptions" : "Abonnements", revenue.subscriptions], [en ? "Studio top-ups" : "Recharges Studio", revenue.studio], [en ? "Total collected" : "Total encaissé", revenue.total]].map(([label, value]) => <article className="admin-kpi" key={String(label)}><small>{label}</small><strong>{money(value as number | null)}</strong></article>)}
      </div>
      {revenue.complete && <p className="admin-help">{en ? `${revenue.subscriptionPayments} subscription payment(s) · ${revenue.studioPayments} paid top-up(s). A zero means no successful payment recorded.` : `${revenue.subscriptionPayments} paiement(s) d’abonnement · ${revenue.studioPayments} recharge(s) payée(s). Un zéro signifie qu’aucun paiement réussi n’est enregistré.`}</p>}
      <p className="admin-help">{en ? "Sources: SasPay-verified payment_events and credit_transactions. Dates are recording dates (UTC). Free/manual credits, pending and failed payments excluded. Gross collections, not profit or MRR. No monetary refund ledger is available; Studio credit restorations are not cash refunds." : "Sources : payment_events et credit_transactions vérifiés par SasPay. Dates d’enregistrement (UTC). Crédits gratuits/manuels et paiements en attente ou échoués exclus. Encaissements bruts, ni bénéfice ni MRR. Aucun registre de remboursements monétaires disponible ; les restitutions de crédits Studio ne sont pas des remboursements d’argent."}</p>
    </>}
  </section>;
}
