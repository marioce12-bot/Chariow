"use client";
import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import { fetchAdminJson } from "@/lib/admin-fetch";
import type { TransactionItem, TransactionsSummary } from "@/lib/admin-transactions";
import { AdminTable, Empty } from "./AdminSections";
import { AdminPeriodPicker, periodQuery } from "./AdminPeriodPicker";
import "./admin-revenue.css";

type Item = TransactionItem & { user: { full_name: string | null; email: string | null } | null };
type Payload = { summary: TransactionsSummary; items: Item[]; truncated: boolean; asOf: string };
type Kind = "all" | "subscription" | "credits";

// Registre détaillé des encaissements : abonnements + achats de crédits, par période.
export function AdminTransactions({ refreshRevision = 0 }: { refreshRevision?: number }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const language = en ? "en-US" : "fr-FR";
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState(() => periodQuery("30d"));
  const [kind, setKind] = useState<Kind>("all");
  const [paidOnly, setPaidOnly] = useState(false);
  useEffect(() => {
    let current = true;
    setState("loading");
    fetchAdminJson(`/api/admin/transactions${query}`).then((payload) => {
      const value = payload.transactions;
      if (!value?.summary || !Array.isArray(value.items)) throw new Error();
      if (current) { setData(value); setState("ready"); }
    }).catch(() => { if (current) setState("error"); });
    return () => { current = false; };
  }, [refreshRevision, retry, query]);
  const money = (value: number | null) => value == null ? "—" : `${value.toLocaleString(language)} XOF`;
  const n = (value: number) => value.toLocaleString(language);
  const statusLabel: Record<TransactionItem["status"], string> = en
    ? { paid: "Paid", pending: "Pending", failed: "Failed", unverified: "To verify" }
    : { paid: "Payé", pending: "En attente", failed: "Échoué", unverified: "À vérifier" };
  const typeLabel = (item: Item) => item.type === "subscription" ? (en ? "Subscription" : "Abonnement") : `${en ? "Credits" : "Crédits"}${item.credits ? ` · ${n(item.credits)}` : ""}`;
  const rows = (data?.items ?? []).filter((item) => (kind === "all" || item.type === kind) && (!paidOnly || item.status === "paid"));
  const s = data?.summary;
  return <section className="admin-card admin-revenue" aria-label={en ? "Transactions" : "Transactions"}>
    <div className="admin-card-head"><div><h2>{en ? "Transactions & revenue" : "Transactions et chiffre d’affaires"}</h2>
      <p className="admin-help">{en ? "Subscription payments and credit purchases. Only confirmed XOF payments are totalled." : "Paiements d’abonnement et achats de crédits. Seuls les paiements XOF confirmés sont totalisés."}</p></div><Receipt size={19} /></div>
    <AdminPeriodPicker idPrefix="transactions" onChange={setQuery} />
    {state === "loading" && <p role="status">{en ? "Loading transactions…" : "Chargement des transactions…"}</p>}
    {state === "error" && <p role="alert">{en ? "Transactions unavailable. No estimated total is shown." : "Transactions indisponibles. Aucun total estimé n’est affiché."} <button className="admin-btn admin-btn-soft" onClick={() => setRetry((v) => v + 1)}>{en ? "Retry" : "Réessayer"}</button></p>}
    {data && s && state === "ready" && <>
      <div className="admin-revenue-grid" aria-live="polite">
        <article className="admin-kpi"><small>{en ? "Subscriptions" : "Abonnements"}</small><strong>{money(s.subscriptions_xof)}</strong><small>{n(s.subscription_count)} {en ? "payment(s)" : "paiement(s)"}</small></article>
        <article className="admin-kpi"><small>{en ? "Credit purchases" : "Achats de crédits"}</small><strong>{money(s.credits_xof)}</strong><small>{n(s.credit_count)} {en ? "purchase(s)" : "achat(s)"}</small></article>
        <article className="admin-kpi"><small>{en ? "Total collected" : "Total encaissé"}</small><strong>{money(s.total_xof)}</strong><small>{n(s.free_credit_grants)} {en ? "free credit grant(s) excluded" : "attribution(s) gratuite(s) exclue(s)"}</small></article>
      </div>
      {(s.unverified > 0 || s.pending > 0 || s.failed > 0) && <p className="admin-help">
        {en ? `Not counted in the totals: ${n(s.pending)} pending, ${n(s.failed)} failed, ${n(s.unverified)} to verify (missing provider, reference, amount or currency).`
          : `Non comptés dans les totaux : ${n(s.pending)} en attente, ${n(s.failed)} échoué(s), ${n(s.unverified)} à vérifier (fournisseur, référence, montant ou devise manquant).`}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 14px" }}>
        {([["all", en ? "All" : "Tout"], ["subscription", en ? "Subscriptions" : "Abonnements"], ["credits", en ? "Credits" : "Crédits"]] as [Kind, string][]).map(([key, label]) =>
          <button type="button" key={key} aria-pressed={kind === key} className={`admin-btn ${kind === key ? "admin-btn-primary" : "admin-btn-soft"}`} onClick={() => setKind(key)}>{label}</button>)}
        <button type="button" aria-pressed={paidOnly} className={`admin-btn ${paidOnly ? "admin-btn-primary" : "admin-btn-soft"}`} onClick={() => setPaidOnly((v) => !v)}>{en ? "Paid only" : "Payés seulement"}</button>
      </div>
      {rows.length ? <AdminTable headers={[en ? "Account" : "Compte", "Type", en ? "Amount" : "Montant", en ? "Reference" : "Référence", en ? "Status" : "Statut", "Date"]}>
        {rows.map((item) => <div className="admin-row" key={`${item.type}-${item.id}`}>
          <span data-label={en ? "Account" : "Compte"}><strong>{item.user?.full_name || (en ? "Account" : "Compte")}</strong><small style={{ display: "block", color: "#8b7a99" }}>{item.user?.email ?? "—"}</small></span>
          <span data-label="Type">{typeLabel(item)}</span>
          <span data-label={en ? "Amount" : "Montant"}>{money(item.amount_xof)}</span>
          <span data-label={en ? "Reference" : "Référence"}>{item.reference ? item.reference.slice(0, 14) : "—"}{item.provider ? ` · ${item.provider}` : ""}</span>
          <span data-label={en ? "Status" : "Statut"}><span className={`admin-status ${item.status === "paid" ? "active" : item.status === "failed" || item.status === "unverified" ? "failed" : ""}`}>{statusLabel[item.status]}</span></span>
          <span data-label="Date">{new Date(item.created_at).toLocaleString(language)}</span>
        </div>)}
      </AdminTable> : <Empty text={en ? "No transaction in this period." : "Aucune transaction sur cette période."} />}
      {data.truncated && <p className="admin-help">{en ? "List limited to the 500 most recent rows; totals cover the whole period." : "Liste limitée aux 500 lignes les plus récentes ; les totaux couvrent toute la période."}</p>}
    </>}
  </section>;
}
