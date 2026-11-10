"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { fetchAdminJson } from "@/lib/admin-fetch";
import type { RevenueSummary } from "@/lib/admin-revenue";
import "./admin-revenue.css";

type Preset = "all" | "7d" | "30d" | "90d" | "custom";
type ChartScale = "linear" | "log";
export function AdminRevenue({ refreshRevision = 0 }: { refreshRevision?: number }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const language = en ? "en-US" : "fr-FR";
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [preset, setPreset] = useState<Preset>("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [query, setQuery] = useState(() => periodQuery("all"));
  const [invalid, setInvalid] = useState(false);
  const [chartScale, setChartScale] = useState<ChartScale>("linear");
  const [activePoint, setActivePoint] = useState<number | null>(null);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const copy = en ? {
    title: "Vendeo SaaS revenue", period: "Revenue period", all: "All recorded history", custom: "Custom range", start: "Start date", end: "End date", apply: "Apply", invalid: "Enter valid start and end dates. The start date must not be after the end date or in the future.", subscriptions: "Subscriptions", studio: "Studio top-ups", total: "Total collected", trend: "Revenue over the selected period", details: "View daily revenue", day: "Date", empty: "No revenue recorded in this period.", days: "days", chartUnit: "Recorded revenue (XOF)", linearScale: "Linear · starts at 0 XOF", logScale: "Logarithmic scale · spacing is not proportional to revenue; zero days stay at the baseline", linearMode: "Linear amounts", logMode: "See smaller amounts", zeroDay: "No recorded revenue on this day", pointTotal: "Total collected", pointSubscriptions: "Subscriptions", pointStudio: "Studio top-ups", noValues: "No revenue recorded in this period; there is no bar chart to show.",
  } : {
    title: "Chiffre d’affaires SaaS Vendeo", period: "Période des revenus", all: "Tout l’historique enregistré", custom: "Intervalle personnalisé", start: "Date de début", end: "Date de fin", apply: "Appliquer", invalid: "Saisissez des dates de début et de fin valides. La date de début ne doit pas être après la date de fin ni dans le futur.", subscriptions: "Abonnements", studio: "Recharges Studio", total: "Total encaissé", trend: "Revenus sur la période sélectionnée", details: "Voir les revenus par jour", day: "Date", empty: "Aucun revenu enregistré sur cette période.", days: "jours", chartUnit: "Revenus enregistrés (XOF)", linearScale: "Linéaire · départ à 0 XOF", logScale: "Échelle logarithmique · les espacements ne sont pas proportionnels aux revenus ; les jours à 0 restent sur la base", linearMode: "Montants linéaires", logMode: "Mieux voir les petits montants", zeroDay: "Aucun revenu enregistré ce jour-là", pointTotal: "Total encaissé", pointSubscriptions: "Abonnements", pointStudio: "Recharges Studio", noValues: "Aucun revenu enregistré sur cette période : il n’y a pas de graphique à barres à afficher.",
  };
  function periodQuery(value: Preset, from = "", to = "") {
    const params = new URLSearchParams({ period: value, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    if (value === "custom") { params.set("start", from); params.set("end", to); }
    return `?${params}`;
  }
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
  const max = Math.max(0, ...series.map(row => row.total));
  const hasRevenue = series.some(row => row.total > 0);
  const axisMoney = (value: number) => new Intl.NumberFormat(language, { notation: "compact", maximumFractionDigits: 1 }).format(value);
  const chartWidth = Math.max(720, 98 + series.length * 8);
  const plot = { left: 82, right: chartWidth - 16, top: 40, bottom: 230 };
  const roughStep = (max || 1) / 4;
  const stepMagnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalizedStep = roughStep / stepMagnitude;
  const linearStep = (normalizedStep <= 1 ? 1 : normalizedStep <= 2 ? 2 : normalizedStep <= 5 ? 5 : 10) * stepMagnitude;
  const linearMax = max > 0 ? Math.ceil(max / linearStep) * linearStep : 1;
  const logPosition = (value: number) => max > 0 ? Math.log1p(value) / Math.log1p(max) : 0;
  const yPosition = (value: number) => plot.bottom - (chartScale === "log" ? logPosition(value) : value / linearMax) * (plot.bottom - plot.top);
  const xPosition = (index: number) => series.length > 1 ? plot.left + index / (series.length - 1) * (plot.right - plot.left) : (plot.left + plot.right) / 2;
  const chartTicks = chartScale === "linear"
    ? Array.from({ length: Math.floor(linearMax / linearStep) + 1 }, (_, index) => index * linearStep)
    : max > 0 ? [...Array.from({ length: Math.floor(Math.log10(max)) + 1 }, (_, exponent) => 10 ** exponent).filter(value => value < max), max] : [];
  const xLabelIndices = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];
  const barWidth = series.length > 1 ? Math.max(3, Math.min(22, ((plot.right - plot.left) / series.length) * .72)) : 22;
  const selected = activePoint === null ? null : series[activePoint] ?? null;
  return <section className="admin-card admin-revenue" aria-label={copy.title}>
    <div className="admin-card-head"><div><h2>{copy.title}</h2><p className="admin-help">{en ? "Recorded successful payments only · not store sales" : "Paiements réussis enregistrés uniquement · hors ventes des boutiques"}</p></div></div>
    <form className="admin-revenue-period" onSubmit={event => {
      event.preventDefault();
      const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
      if (preset === "custom" && (!validDate(start) || !validDate(end) || start > end || start > today)) { setInvalid(true); return; }
      setInvalid(false); setQuery(periodQuery(preset, start, end));
    }} noValidate>
      <label>{copy.period}<select value={preset} onChange={event => {
        const value = event.target.value as Preset; setPreset(value); setInvalid(false);
        if (value !== "custom") setQuery(periodQuery(value));
      }}>
        <option value="all">{copy.all}</option>
        {[7, 30, 90].map(count => <option key={count} value={`${count}d`}>{count} {copy.days}</option>)}
        <option value="custom">{copy.custom}</option>
      </select></label>
      {preset === "custom" && <>
        <label>{copy.start}<input type="date" max={today} value={start} onChange={event => setStart(event.target.value)} required aria-invalid={invalid} aria-describedby={invalid ? "revenue-period-error" : undefined} /></label>
        <label>{copy.end}<input type="date" value={end} onChange={event => setEnd(event.target.value)} required aria-invalid={invalid} aria-describedby={invalid ? "revenue-period-error" : undefined} /></label>
        <button className="admin-btn admin-btn-soft" type="submit">{copy.apply}</button>
      </>}
      {invalid && <p id="revenue-period-error" className="admin-revenue-period-error" role="alert">{copy.invalid}</p>}
    </form>
    {state === "loading" && <p role="status">{en ? "Loading revenue…" : "Chargement des revenus…"}</p>}
    {state === "error" && <p role="alert">{en ? "Revenue unavailable. No estimated total is shown." : "Revenus indisponibles. Aucun total estimé n’est affiché."} <button className="admin-btn admin-btn-soft" onClick={() => setRetry(v => v + 1)}>{en ? "Retry" : "Réessayer"}</button></p>}
    {revenue && <>
      <p className="admin-help">{revenue.period?.preset === "custom" ? copy.custom : revenue.period?.preset && revenue.period.preset !== "all" ? `${revenue.period.preset.slice(0, -1)} ${copy.days}` : copy.all}{(revenue.period?.startAt ?? revenue.firstRecordedAt) ? ` · ${date((revenue.period?.startAt ?? revenue.firstRecordedAt)!)} → ${date(revenue.period?.endAt ?? revenue.asOf)}` : ` · ${en ? "through" : "jusqu’au"} ${date(revenue.asOf)}`}</p>
      {!revenue.complete && <p role="alert">{en ? `${revenue.unresolved} record(s) lack reliable payment, amount, currency or refund evidence. Totals are withheld.` : `${revenue.unresolved} écriture(s) sans preuve fiable de paiement, montant, devise ou remboursement. Les totaux ne sont pas affichés.`}</p>}
      <div className="admin-revenue-grid" aria-live="polite">
        {[[copy.subscriptions, revenue.subscriptions], [copy.studio, revenue.studio], [copy.total, revenue.total]].map(([label, value]) => <article className="admin-kpi" key={String(label)}><small>{label}</small><strong>{money(value as number | null)}</strong></article>)}
      </div>
      {revenue.complete && <div className="admin-revenue-trend">
        <h3>{copy.trend}</h3>
        {series.length > 0 ? <>
          {!hasRevenue ? <p className="admin-help" role="status">{copy.noValues}</p> : <>
            <div className="admin-revenue-chart-controls" role="group" aria-label={en ? "Chart scale" : "Échelle du graphique"}>
              <p className="admin-revenue-chart-unit">{copy.chartUnit}</p>
              <div className="admin-revenue-chart-modes">
                <button type="button" className={chartScale === "linear" ? "active" : ""} aria-pressed={chartScale === "linear"} onClick={() => setChartScale("linear")}>{copy.linearMode}</button>
                <button type="button" className={chartScale === "log" ? "active" : ""} aria-pressed={chartScale === "log"} onClick={() => setChartScale("log")}>{copy.logMode}</button>
              </div>
            </div>
            <p className="admin-revenue-chart-scale-note">{chartScale === "linear" ? copy.linearScale : copy.logScale}</p>
            <div className="admin-revenue-chart-wrap" tabIndex={0} role="region" aria-label={en ? "Daily revenue bar chart; scroll horizontally to see the full period" : "Graphique des revenus par jour ; faites défiler horizontalement pour voir toute la période"}>
              <svg className="admin-revenue-chart-svg" viewBox={`0 0 ${chartWidth} 280`} width={chartWidth} height="280" style={{ width: `max(100%, ${chartWidth}px)` }} role="group" aria-label={`${copy.trend} · ${chartScale === "linear" ? copy.linearScale : copy.logScale}`}>
                {chartTicks.map((tick, index) => {
                  const y = yPosition(tick);
                  return <g key={`${chartScale}-${index}`} aria-hidden="true"><line x1={plot.left} y1={y} x2={plot.right} y2={y} className="admin-revenue-chart-grid" /><text x={plot.left - 10} y={y + 4} textAnchor="end" className="admin-revenue-chart-y-label">{axisMoney(tick)}</text></g>;
                })}
                <line x1={plot.left} y1={plot.bottom} x2={plot.right} y2={plot.bottom} className="admin-revenue-chart-baseline" aria-hidden="true" />
                {series.map((row, index) => {
                  const y = yPosition(row.total);
                  const zero = row.total === 0;
                  return <rect key={row.date} x={xPosition(index) - barWidth / 2} y={zero ? plot.bottom - 1 : y} width={barWidth} height={zero ? 2 : plot.bottom - y} rx="2" className={`admin-revenue-chart-bar${zero ? " zero" : ""}${activePoint === index ? " active" : ""}`} role="button" tabIndex={0}
                  aria-label={`${day(row.date)} · ${copy.pointTotal} : ${money(row.total)} · ${copy.pointSubscriptions} : ${money(row.subscriptions)} · ${copy.pointStudio} : ${money(row.studio)}`}
                  onPointerEnter={event => { if (event.pointerType === "mouse") setActivePoint(index); }}
                  onPointerLeave={event => { if (event.pointerType === "mouse") setActivePoint(null); }}
                  onFocus={() => setActivePoint(index)} onBlur={() => setActivePoint(null)}
                  onClick={() => setActivePoint(index)}
                  onKeyDown={event => { if (event.key === "Escape") setActivePoint(null); }} />;
                })}
                {xLabelIndices.map(index => <text key={series[index].date} x={xPosition(index)} y="262" textAnchor={index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"} className="admin-revenue-chart-x-label">{day(series[index].date)}</text>)}
              </svg>
            </div>
            {selected && <div className="admin-revenue-chart-detail" aria-live="polite">
              <strong>{day(selected.date)}</strong>
              {selected.total === 0 ? <span>{copy.zeroDay}</span> : <>
                <span>{copy.pointTotal}<b>{money(selected.total)}</b></span>
                <span>{copy.pointSubscriptions}<b>{money(selected.subscriptions)}</b></span>
                <span>{copy.pointStudio}<b>{money(selected.studio)}</b></span>
              </>}
            </div>}
          </>}
          <details><summary>{copy.details}</summary><div className="admin-revenue-table-scroll" tabIndex={0} role="region" aria-label={copy.details}><table><caption className="sr-only">{copy.trend}</caption><thead><tr>{[copy.day, copy.subscriptions, copy.studio, copy.total].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{series.map(row => <tr key={row.date}><th scope="row">{day(row.date)}</th><td>{money(row.subscriptions)}</td><td>{money(row.studio)}</td><td>{money(row.total)}</td></tr>)}</tbody></table></div></details>
        </> : <p className="admin-help">{copy.empty}</p>}
      </div>}
    </>}
  </section>;
}
