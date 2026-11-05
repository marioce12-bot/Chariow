"use client";
import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import { fetchAdminJson } from "@/lib/admin-fetch";
import { AdminTable, Empty } from "./AdminSections";
import "./admin-revenue.css";

type State = "paying" | "trial" | "expired" | "other";
type Subscribers = {
  asOf: string; truncated: boolean;
  counts: Record<State | "total", number>;
  items: Array<{ id: string; user_id: string; plan: string; status: string; state: State; current_period_start: string | null; current_period_end: string | null; trial_ends_at: string | null; user: { full_name: string | null; email: string | null } | null }>;
};
type Filter = "current" | State | "all";

// Abonnés en cours (payants + essais) avec filtre ; compte tous les abonnements, pas un échantillon.
export function AdminSubscribers({ refreshRevision = 0 }: { refreshRevision?: number }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const language = en ? "en-US" : "fr-FR";
  const [data, setData] = useState<Subscribers | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [filter, setFilter] = useState<Filter>("current");
  useEffect(() => {
    let current = true;
    setState("loading");
    fetchAdminJson("/api/admin/subscribers").then((payload) => {
      if (!payload.subscribers?.counts || !Array.isArray(payload.subscribers.items)) throw new Error();
      if (current) { setData(payload.subscribers); setState("ready"); }
    }).catch(() => { if (current) setState("error"); });
    return () => { current = false; };
  }, [refreshRevision, retry]);
  const n = (value: number) => value.toLocaleString(language);
  const day = (value: string | null) => value ? new Date(value).toLocaleDateString(language) : "—";
  const stateLabel: Record<State, string> = en
    ? { paying: "Paying", trial: "Trial", expired: "Expired", other: "Other" }
    : { paying: "Payant", trial: "Essai", expired: "Expiré", other: "Autre" };
  const filters: [Filter, string][] = [
    ["current", en ? "In progress" : "En cours"], ["paying", stateLabel.paying], ["trial", stateLabel.trial],
    ["expired", stateLabel.expired], ["all", en ? "All" : "Tous"],
  ];
  const rows = (data?.items ?? []).filter((item) => filter === "all" || (filter === "current" ? item.state === "paying" || item.state === "trial" : item.state === filter));
  return <section className="admin-card admin-revenue" aria-label={en ? "Current subscribers" : "Abonnés en cours"}>
    <div className="admin-card-head"><div><h2>{en ? "Current subscribers" : "Abonnés en cours"}</h2>
      <p className="admin-help">{en ? "Computed from period and trial dates, not only the stored status" : "Calculé à partir des dates de période et d’essai, pas seulement du statut enregistré"}</p></div><Users size={19} /></div>
    {state === "loading" && <p role="status">{en ? "Loading subscribers…" : "Chargement des abonnés…"}</p>}
    {state === "error" && <p role="alert">{en ? "Subscribers unavailable." : "Abonnés indisponibles."} <button className="admin-btn admin-btn-soft" onClick={() => setRetry((v) => v + 1)}>{en ? "Retry" : "Réessayer"}</button></p>}
    {data && state === "ready" && <>
      <div className="admin-revenue-grid">
        <article className="admin-kpi"><small>{en ? "Paying subscribers" : "Abonnés payants en cours"}</small><strong>{n(data.counts.paying)}</strong></article>
        <article className="admin-kpi"><small>{en ? "Free trials in progress" : "Essais gratuits en cours"}</small><strong>{n(data.counts.trial)}</strong></article>
        <article className="admin-kpi"><small>{en ? "Expired" : "Expirés"}</small><strong>{n(data.counts.expired)}</strong><small>{en ? `${n(data.counts.total)} subscriptions in total` : `${n(data.counts.total)} abonnements au total`}</small></article>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 14px" }}>
        {filters.map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} className={`admin-btn ${filter === key ? "admin-btn-primary" : "admin-btn-soft"}`} onClick={() => setFilter(key)}>{label}</button>)}
      </div>
      {rows.length ? <AdminTable headers={[en ? "Account" : "Compte", en ? "Type" : "Type", en ? "Plan" : "Offre", en ? "Started" : "Début", en ? "Ends" : "Fin"]}>
        {rows.map((item) => <div className="admin-row" key={item.id}>
          <span data-label={en ? "Account" : "Compte"}><strong>{item.user?.full_name || (en ? "Account" : "Compte")}</strong><small style={{ display: "block", color: "#8b7a99" }}>{item.user?.email ?? "—"}</small></span>
          <span data-label="Type"><span className={`admin-status ${item.state === "paying" ? "active" : item.state === "expired" ? "failed" : ""}`}>{stateLabel[item.state]}</span></span>
          <span data-label={en ? "Plan" : "Offre"}>{item.plan}</span>
          <span data-label={en ? "Started" : "Début"}>{day(item.current_period_start)}</span>
          <span data-label={en ? "Ends" : "Fin"}>{day(item.state === "trial" ? item.trial_ends_at : item.current_period_end)}</span>
        </div>)}
      </AdminTable> : <Empty text={en ? "No subscriber in this category." : "Aucun abonné dans cette catégorie."} />}
      {data.truncated && <p className="admin-help">{en ? "List limited to 1,000 rows; the counters above cover every subscription." : "Liste limitée à 1 000 lignes ; les compteurs ci-dessus couvrent tous les abonnements."}</p>}
    </>}
  </section>;
}
