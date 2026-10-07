"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createClient } from "@/lib/supabase/browser";
import "@/app/stack-chart-nav.css";

function EmptyState({ title, text }: { title: string; text: string }) { return <div className="home-empty"><strong>{title}</strong><span>{text}</span></div>; }

const STACK_DAYS = 7;
const STACK_COLORS = ["#4c21f6", "#029bfc", "#43a765", "#f5a524"];
const STACK_OTHERS_COLOR = "#94a3b8";
const stackCompact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
type StackSeries = { key: string; label: string; color: string };
function stackRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stackDayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function stackSaleDay(raw: unknown): string | null { if (typeof raw !== "string" || !raw) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; const date = new Date(raw); return Number.isNaN(date.getTime()) ? null : stackDayKey(date); }
function stackAmount(raw: unknown): number { const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>).value : raw; const parsed = typeof source === "number" ? source : typeof source === "string" ? Number(source.replace(/[^\d.,-]/g, "").replace(",", ".")) : 0; return Number.isFinite(parsed) ? parsed : 0; }
function stackScale(maxValue: number) { const rough = Math.max(maxValue, 1) / 4; const magnitude = 10 ** Math.floor(Math.log10(rough)); const residual = rough / magnitude; const factor = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10; const step = factor * magnitude; return { step, max: Math.ceil(Math.max(maxValue, 1) / step) * step }; }
function stackRangeLabel(first: Date, last: Date) {
  const sameYear = first.getFullYear() === last.getFullYear();
  const sameMonth = sameYear && first.getMonth() === last.getMonth();
  const from = first.toLocaleDateString("fr-FR", { day: "numeric", ...(sameMonth ? {} : { month: "short" }), ...(sameYear ? {} : { year: "numeric" }) });
  const to = last.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  return `${from} – ${to}`;
}
export function RevenueTrendChart({ sales, products, currency, revenueCurrencies = [], storeId = null }: { sales: unknown[]; products: Array<{ id: string; name: string }>; currency: string; revenueCurrencies?: string[]; storeId?: string | null }) {
  const [active, setActive] = useState<number | null>(null); const rootRef = useRef<HTMLDivElement>(null);
  // Nombre de périodes de 7 jours remontées dans le passé (0 = les 7 derniers jours jusqu'à aujourd'hui).
  const [offset, setOffset] = useState(0);
  const [stored, setStored] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const days = useMemo(() => {
    const today = new Date(); today.setHours(12, 0, 0, 0);
    return Array.from({ length: STACK_DAYS }, (_, index) => { const date = new Date(today); date.setDate(date.getDate() - offset * STACK_DAYS - (STACK_DAYS - 1 - index)); return { date, key: stackDayKey(date), weekday: date.toLocaleDateString("fr-FR", { weekday: "short" }), num: String(date.getDate()), long: date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) }; });
  }, [offset]);
  const rangeLabel = stackRangeLabel(days[0].date, days[STACK_DAYS - 1].date);
  const todayKey = stackDayKey(new Date());
  const goTo = (next: number) => { setActive(null); setOffset(Math.max(0, next)); };
  // Les ventes déjà persistées en base servent à remonter plus loin que les 100 dernières ventes renvoyées par Chariow.
  useEffect(() => {
    if (!storeId) { setStored([]); return; }
    let cancelled = false;
    const startDate = new Date(days[0].date); startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(days[STACK_DAYS - 1].date); endDate.setHours(23, 59, 59, 999);
    setLoading(true);
    void (async () => {
      try {
        const { data, error } = await createClient().from("chariow_sales").select("chariow_sale_id,status,amount,currency,occurred_at,product_id").eq("store_id", storeId).gte("occurred_at", startDate.toISOString()).lte("occurred_at", endDate.toISOString()).order("occurred_at", { ascending: true }).limit(5000);
        if (cancelled) return;
        setStored(error || !data ? [] : data.map((row: Record<string, unknown>) => ({ id: row.chariow_sale_id, status: row.status, amount: Number(row.amount) || 0, currency: row.currency, created_at: row.occurred_at, product_id: row.product_id })));
      } catch { if (!cancelled) setStored([]); } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [storeId, days]);
  // Jusqu'à 100 ventes arrivent de Chariow : si la liste est complète, on s'en sert seule ; sinon les jours
  // les plus anciens que la vente la plus ancienne reçue sont complétés par les ventes persistées.
  const allSales = useMemo(() => {
    const rowDay = (item: unknown) => { const row = stackRecord(item); return stackSaleDay(row.created_at ?? row.createdAt ?? row.occurred_at); };
    if (!stored.length) return sales;
    if (!sales.length) return stored;
    if (sales.length < 100) return sales;
    let oldest: string | null = null;
    for (const item of sales) { const day = rowDay(item); if (day && (!oldest || day < oldest)) oldest = day; }
    if (!oldest) return sales;
    const limit = oldest;
    return [...sales, ...stored.filter((item) => { const day = rowDay(item); return day !== null && day <= limit; })];
  }, [sales, stored]);
  const observedCurrencies = new Set(allSales.filter((item) => { const row = stackRecord(item); const status = row.status ?? row.state; return status === "completed" || status === "settled"; }).map((item) => { const row = stackRecord(item); const amount = stackRecord(row.amount); return String(row.currency ?? amount.currency ?? "").trim().toUpperCase(); }).filter(Boolean));
  const allCurrencySignals = revenueCurrencies.length ? new Set(revenueCurrencies.map((value) => value.toUpperCase())) : observedCurrencies;
  const hasUnknownCurrency = allCurrencySignals.has("UNKNOWN") || allSales.some((item) => { const row = stackRecord(item); const status = row.status ?? row.state; if (status !== "completed" && status !== "settled") return false; const amount = stackRecord(row.amount); return !String(row.currency ?? amount.currency ?? "").trim(); });
  const chartCurrency = allCurrencySignals.size === 1 ? [...allCurrencySignals][0] : currency;
  useEffect(() => { const close = (event: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setActive(null); }; document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close); }, []);
  const chart = useMemo(() => {
    const dayIndex = new Map(days.map((day, index) => [day.key, index] as const)); const names = new Map(products.map((product) => [String(product.id), product.name] as const)); const perProduct = new Map<string, { label: string; total: number; days: number[] }>();
    for (const item of allSales) { const row = stackRecord(item); const status = row.status ?? row.state; if (status !== "completed" && status !== "settled") continue; const index = stackSaleDay(row.created_at ?? row.createdAt ?? row.occurred_at); const dayPos = index ? dayIndex.get(index) : undefined; if (dayPos === undefined) continue; const product = stackRecord(row.product); const rawId = row.product_id ?? product.id ?? product.uuid; const id = rawId === undefined || rawId === null ? "" : String(rawId); const label = (id && names.get(id)) || String(row.product_name ?? product.name ?? product.title ?? "") || "Produit"; const key = id || label; const amount = stackAmount(row.amount); const entry = perProduct.get(key) ?? { label, total: 0, days: new Array<number>(STACK_DAYS).fill(0) }; entry.days[dayPos] += amount; entry.total += amount; perProduct.set(key, entry); }
    const ranked = Array.from(perProduct.entries()).sort((a, b) => b[1].total - a[1].total); const top = ranked.slice(0, STACK_COLORS.length); const rest = ranked.slice(STACK_COLORS.length); const series: StackSeries[] = top.map(([key, entry], index) => ({ key, label: entry.label, color: STACK_COLORS[index] })); const matrix: number[][] = days.map((_, dayPos) => top.map(([, entry]) => entry.days[dayPos])); if (rest.length) { series.push({ key: "__others", label: "Autres", color: STACK_OTHERS_COLOR }); matrix.forEach((row, dayPos) => row.push(rest.reduce((sum, [, entry]) => sum + entry.days[dayPos], 0))); } const dayTotals = matrix.map((row) => row.reduce((sum, value) => sum + value, 0)); const grand = dayTotals.reduce((sum, value) => sum + value, 0); const scale = stackScale(Math.max(...dayTotals)); const ticks = Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, index) => index * scale.step); return { days, series, matrix, dayTotals, grand, scale, ticks };
  }, [allSales, products, days]);
  const money = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} ${chartCurrency}`;
  if (allCurrencySignals.size > 1 || hasUnknownCurrency) return <EmptyState title="Graphique non comparable" text="Les ventes utilisent plusieurs devises ou n’indiquent pas leur monnaie. Les montants restent séparés dans les indicateurs." />;
  const onPointerDown = (event: ReactPointerEvent) => { swipeStart.current = { x: event.clientX, y: event.clientY }; swiped.current = false; };
  const onPointerUp = (event: ReactPointerEvent) => {
    const start = swipeStart.current; swipeStart.current = null; if (!start) return;
    const dx = event.clientX - start.x; const dy = event.clientY - start.y;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    swiped.current = true;
    // Glisser vers la droite = période plus ancienne ; vers la gauche = période plus récente.
    goTo(offset + (dx > 0 ? 1 : -1));
  };
  const onDatePick = (value: string) => {
    if (!value) return;
    const picked = new Date(`${value}T12:00:00`); const today = new Date(); today.setHours(12, 0, 0, 0);
    if (Number.isNaN(picked.getTime())) return;
    const diffDays = Math.round((today.getTime() - picked.getTime()) / 86_400_000);
    goTo(Math.floor(Math.max(0, diffDays) / STACK_DAYS));
  };
  return <div className="stack-chart" ref={rootRef} role="group" aria-label={`Chiffre d'affaires du ${rangeLabel} par produit, total ${money(chart.grand)}`}>
    <div className="stack-nav">
      <button type="button" className="stack-nav-btn" aria-label="Période précédente" onClick={() => goTo(offset + 1)}>‹</button>
      <div className="stack-nav-label"><strong>{rangeLabel}</strong>{offset > 0 ? <button type="button" className="stack-nav-today" onClick={() => goTo(0)}>Revenir à aujourd’hui</button> : <small>7 derniers jours</small>}</div>
      <button type="button" className="stack-nav-btn" aria-label="Période suivante" disabled={offset === 0} onClick={() => goTo(offset - 1)}>›</button>
    </div>
    <label className="stack-nav-date"><span>Aller à une date</span><input type="date" max={todayKey} value={days[STACK_DAYS - 1].key} onChange={(event) => onDatePick(event.target.value)} /></label>
    {chart.grand ? <ul className="stack-legend">{chart.series.map((item) => <li key={item.key}><i style={{ background: item.color }} /><span>{item.label}</span></li>)}</ul> : null}
    <div className={`stack-body stack-swipe${loading ? " stack-loading" : ""}`} onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { swipeStart.current = null; }}>
      <div className="stack-y" aria-hidden="true">{chart.ticks.map((tick) => <span key={tick} style={{ bottom: `${(tick / chart.scale.max) * 100}%` }}>{stackCompact.format(tick)}</span>)}</div>
      <div className="stack-plot">{chart.ticks.map((tick) => <i key={tick} className="stack-grid" aria-hidden="true" style={{ bottom: `${(tick / chart.scale.max) * 100}%` }} />)}
        <div className="stack-cols" key={days[0].key}>{chart.days.map((day, index) => { const total = chart.dayTotals[index]; return <button type="button" key={day.key} className={`stack-col${active === index ? " active" : ""}`} aria-label={`${day.long} : ${money(total)}`} onPointerEnter={(event) => { if (event.pointerType === "mouse") setActive(index); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") setActive(null); }} onClick={(event) => { if (swiped.current) { swiped.current = false; return; } if ((event.nativeEvent as PointerEvent).pointerType === "mouse") return; setActive((current) => current === index ? null : index); }}><span className="stack-bar" style={{ height: `${(total / chart.scale.max) * 100}%` }}>{chart.series.map((item, seriesIndex) => { const value = chart.matrix[index][seriesIndex]; return value > 0 ? <span key={item.key} className="stack-seg" style={{ height: `${(value / total) * 100}%`, background: item.color }} /> : null; })}</span></button>; })}</div>
        {!chart.grand && !loading ? <div className="stack-empty-note"><strong>Aucune vente sur cette période</strong><span>Fais glisser le graphique pour changer de période.</span></div> : null}
        {active !== null ? <div className="stack-tip" style={{ left: `${((active + 0.5) / STACK_DAYS) * 100}%`, transform: `translateX(${active <= 1 ? "-20%" : active >= STACK_DAYS - 2 ? "-80%" : "-50%"})` }}><strong>{chart.days[active].long}</strong>{chart.dayTotals[active] > 0 ? <>{chart.series.map((item, seriesIndex) => { const value = chart.matrix[active][seriesIndex]; return value > 0 ? <span key={item.key}><i style={{ background: item.color }} />{item.label}<b>{money(value)}</b></span> : null; })}<em>Total {money(chart.dayTotals[active])}</em></> : <span>Aucune vente</span>}</div> : null}
      </div>
    </div>
    <div className="stack-x" aria-hidden="true">{chart.days.map((day) => <span key={day.key}><b>{day.weekday}</b><small>{day.num}</small></span>)}</div>
    <div className="stack-foot"><span className="stack-unit">Montants en {chartCurrency}</span><span className="chart-total">Total de la période : {money(chart.grand)}</span></div>
  </div>;
}
