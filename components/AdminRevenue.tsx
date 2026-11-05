"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { fetchAdminJson } from "@/lib/admin-fetch";
import type { RevenueSummary } from "@/lib/admin-revenue";
import { AdminPeriodPicker } from "./AdminPeriodPicker";
import "./admin-revenue.css";

export function AdminRevenue({ refreshRevision = 0 }: { refreshRevision?: number }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const language = en ? "en-US" : "fr-FR";
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState(() => `?period=all&timeZone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`);
  const copy = en ? {
    title: "Vendeo SaaS revenue", period: "Revenue period", all: "All recorded history", custom: "Custom range", start: "Start date", end: "End date", apply: "Apply", invalid: "Enter valid start and end dates. The start date must not be after the end date or in the future.", subscriptions: "Subscriptions", studio: "Studio top-ups", total: "Verified total", trend: "Revenue over the selected period", details: "View daily revenue", day: "Date", empty: "No revenue recorded in this period.", days: "days",
  } : {
    title: "Chiffre d’affaires SaaS Vendeo", period: "Période des revenus", all: "Tout l’historique enregistré", custom: "Intervalle personnalisé", start: "Date de début", end: "Date de fin", apply: "Appliquer", invalid: "Saisissez des dates de début et de fin valides. La date de début ne doit pas être après la date de fin ni dans le futur.", subscriptions: "Abonnements", studio: "Recharges Studio", total: "Total vérifié", trend: "Revenus sur la période sélectionnée", details: "Voir les revenus par jour", day: "Date", empty: "Aucun revenu enregistré sur cette période.", days: "jours",
  };
  useEffect(() => {
    let current = true;
    setRevenue(null); setState("loading");
    fetchAdminJson(`/api/admin/revenue${query}`).then((payload) => {
      if (!payload.revenue || typeof payload.revenue.complete !== "boolean") throw new Error();
      if (current) { setRevenue(payload.revenue); setState("ready"); }
    }).catch(() => { if (current) setState("error"); });
    return () => { current = false; };
  }, [refreshRevision, retry, query]);
  const money = (value: number | null | undefined) => value == null ? "—" : `${value.toLocaleString(language)} XOF`;
  const date = (value: string) => new Date(value).toLocaleDateString(language, { timeZone: revenue?.period?.timeZone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
  const day = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(language, { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
  const series = revenue?.series ?? [];
  const max = Math.max(1, ...series.map(row => row.total));
  const points = series.map((row, index) => `${series.length > 1 ? 12 + index / (series.length - 1) * 576 : 300},${132 - row.total / max * 112}`).join(" ");
  return <section className="admin-card admin-revenue" aria-label={copy.title}>
    <div className="admin-card-head"><div><h2>{copy.title}</h2><p className="admin-help">{en ? "Recorded successful payments only · not store sales" : "Paiements réussis enregistrés uniquement · hors ventes des boutiques"}</p></div></div>
    <AdminPeriodPicker onChange={setQuery} idPrefix="revenue-period" />
    {state === "loading" && <p role="status">{en ? "Loading revenue…" : "Chargement des revenus…"}</p>}
    {state === "error" && <p role="alert">{en ? "Revenue unavailable. No estimated total is shown." : "Revenus indisponibles. Aucun total estimé n’est affiché."} <button className="admin-btn admin-btn-soft" onClick={() => setRetry(v => v + 1)}>{en ? "Retry" : "Réessayer"}</button></p>}
    {revenue && <>
      <p className="admin-help">{revenue.period?.preset === "custom" ? copy.custom : revenue.period?.preset && revenue.period.preset !== "all" ? `${revenue.period.preset.slice(0, -1)} ${copy.days}` : copy.all}{(revenue.period?.startAt ?? revenue.firstRecordedAt) ? ` · ${date((revenue.period?.startAt ?? revenue.firstRecordedAt)!)} → ${date(revenue.period?.endAt ?? revenue.asOf)}` : ` · ${en ? "through" : "jusqu’au"} ${date(revenue.asOf)}`}</p>
      {!revenue.complete && <p role="alert">{en ? `${revenue.unresolved} unverified record(s) excluded from the total.` : `${revenue.unresolved} écriture(s) non vérifiée(s) exclue(s) du total.`}</p>}
      <div className="admin-revenue-grid" aria-live="polite">
        {[[copy.subscriptions, revenue.subscriptions], [copy.studio, revenue.studio], [copy.total, revenue.total]].map(([label, value]) => <article className="admin-kpi" key={String(label)}><small>{label}</small><strong>{money(value as number | null)}</strong></article>)}
      </div>
      <div className="admin-revenue-trend">
        <h3>{copy.trend}</h3>
        {series.length > 0 ? <>
          <div className="admin-revenue-chart-scale" aria-hidden="true"><span>{money(max === 1 && !series.some(row => row.total) ? 0 : max)}</span><span>0 XOF</span></div>
          <svg viewBox="0 0 600 150" role="img" aria-label={copy.trend} preserveAspectRatio="none"><line x1="12" y1="132" x2="588" y2="132" stroke="currentColor" opacity="0.2" /><polyline points={points} fill="none" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />{series.length === 1 && <circle cx="300" cy={132 - series[0].total / max * 112} r="4" fill="currentColor" />}</svg>
          <div className="admin-revenue-chart-dates" aria-hidden="true"><span>{day(series[0].date)}</span><span>{day(series[series.length - 1].date)}</span></div>
          <details><summary>{copy.details}</summary><div className="admin-revenue-table-scroll" tabIndex={0} role="region" aria-label={copy.details}><table><caption className="sr-only">{copy.trend}</caption><thead><tr>{[copy.day, copy.subscriptions, copy.studio, copy.total].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{series.map(row => <tr key={row.date}><th scope="row">{day(row.date)}</th><td>{money(row.subscriptions)}</td><td>{money(row.studio)}</td><td>{money(row.total)}</td></tr>)}</tbody></table></div></details>
        </> : <p className="admin-help">{copy.empty}</p>}
      </div>
    </>}
  </section>;
}
