"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { UsageStats } from "@/lib/admin-dashboard-types";
import "./admin-signup-chart.css";

/** Render only returned observations: missing dates are never manufactured as zeros. */
export function AdminSignupChart({ rows, locale }: { rows: UsageStats["signups_by_day"]; locale: string }) {
  const en = locale === "en";
  const canvasRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(800);
  useEffect(() => {
    const node = canvasRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setChartWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const id = useId().replace(/:/g, "");
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"bars" | "line">("bars");
  const data = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const number = (n: number) => n.toLocaleString(en ? "en-US" : "fr-FR");
  const date = (day: string, full = false) => new Date(`${day.slice(0, 10)}T00:00:00Z`).toLocaleDateString(en ? "en-US" : "fr-FR", { day: "numeric", month: full ? "long" : "short", ...(full ? { year: "numeric" } : {}), timeZone: "UTC" });
  const peak = Math.max(0, ...data.map(d => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const rawStep = Math.max(1, peak / 4);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = Math.ceil(rawStep / magnitude) * magnitude;
  const divisions = peak > 0 && peak < 4 ? Math.ceil(peak) : 4;
  const top = step * divisions;
  const left = 36, right = chartWidth - 18, baseline = 228, height = 180;
  const first = Date.parse(data[0]?.day ?? ""), last = Date.parse(data.at(-1)?.day ?? "");
  const x = (day: string) => first === last ? (left + right) / 2 : left + 28 + (Date.parse(day) - first) / (last - first) * (right - left - 56);
  const y = (count: number) => baseline - count / top * height;
  const minGap = data.length > 1 ? Math.min(...data.slice(1).map((d, i) => x(d.day) - x(data[i].day))) : 80;
  const width = Math.max(3, Math.min(42, minGap * .58));
  const active = data.find(d => d.day === selected) ?? data.at(-1);
  // Do not draw trend segments across unreturned days.
  const segments = data.slice(1).filter((d, i) => Date.parse(d.day) - Date.parse(data[i].day) === 86400000).map(d => {
    const i = data.indexOf(d), previous = data[i - 1];
    return `M ${x(previous.day)} ${y(previous.count)} L ${x(d.day)} ${y(d.count)}`;
  }).join(" ");
  if (!data.length) return null;
  return (
    <div className="admin-signup-viz">
      <div className="signup-viz-toolbar">
        <div className="signup-viz-total"><strong>{number(total)}</strong><span>{en ? `${total === 1 ? "registration" : "registrations"} in returned data` : `${total === 1 ? "inscription" : "inscriptions"} dans les données retournées`}</span></div>
        <div className="signup-viz-switch" role="group" aria-label={en ? "Chart style" : "Style du graphique"}>
          <button type="button" aria-pressed={mode === "bars"} onClick={() => setMode("bars")}>{en ? "Bars" : "Barres"}</button>
          <button type="button" aria-pressed={mode === "line"} onClick={() => setMode("line")}>{en ? "Line" : "Courbe"}</button>
        </div>
      </div>
      <div className="signup-viz-legend"><span /><span>{en ? "New accounts" : "Nouveaux comptes"}</span><small>UTC</small></div>
      <div className="signup-viz-canvas" ref={canvasRef}>
        <svg viewBox={`0 0 ${chartWidth} 270`} role="group" aria-labelledby={`${id}-title ${id}-desc`}>
          <title id={`${id}-title`}>{en ? "Daily registrations" : "Inscriptions par jour"}</title>
          <desc id={`${id}-desc`}>{en ? "Only days returned by the source. Focus a point for its exact value." : "Uniquement les jours retournés par la source. Sélectionnez un point pour sa valeur exacte."}</desc>
          <defs><linearGradient id={`${id}-bar`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2563eb" /><stop offset="1" stopColor="#38bdf8" stopOpacity=".65" /></linearGradient></defs>
          {Array.from({ length: divisions + 1 }, (_, i) => i).map(i => <g key={i}><line x1={left} x2={right} y1={baseline - i * height / divisions} y2={baseline - i * height / divisions} stroke="#e2e8f0" strokeDasharray={i ? "3 5" : undefined} /><text x={left - 12} y={baseline - i * height / divisions + 4} textAnchor="end" className="signup-viz-axis">{number(i * step)}</text></g>)}
          {mode === "line" && <path d={segments} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" />}
          {data.map((d, i) => {
            const focused = active?.day === d.day;
            const labelSlots = Math.max(2, Math.floor(chartWidth / 85));
            const showLabel = i === 0 || i === data.length - 1 || (i % Math.ceil(data.length / labelSlots) === 0 && i < data.length - Math.ceil(data.length / labelSlots) / 2);
            return <g key={d.day} role="button" tabIndex={0} aria-label={`${date(d.day, true)} : ${number(d.count)} ${en ? "registrations" : "inscriptions"}`} aria-pressed={focused} onMouseEnter={() => setSelected(d.day)} onFocus={() => setSelected(d.day)} onClick={() => setSelected(d.day)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(d.day); } }} className="signup-viz-point">
              <title>{date(d.day, true)} : {number(d.count)}</title>
              {focused && <rect x={x(d.day) - Math.max(width / 2 + 9, 12)} y={40} width={Math.max(width + 18, 24)} height={baseline - 40} rx="8" fill="#2563eb" opacity=".045" />}
              <rect x={x(d.day) - Math.max(width / 2, 12)} y={40} width={Math.max(width, 24)} height={baseline - 40} fill="transparent" />
              {mode === "bars" ? <rect data-count={d.count} x={x(d.day) - width / 2} y={y(d.count)} width={width} height={d.count / top * height} rx="5" fill={`url(#${id}-bar)`} opacity={focused ? 1 : .7} /> : <circle data-count={d.count} cx={x(d.day)} cy={y(d.count)} r={focused ? 6 : 4} fill="#2563eb" stroke="white" strokeWidth="2" />}
              {(data.length <= Math.floor(chartWidth / 36) || focused) && <text x={x(d.day)} y={y(d.count) - 12} textAnchor="middle" className="signup-viz-value">{number(d.count)}</text>}
              {showLabel && <text x={x(d.day)} y={baseline + 26} textAnchor="middle" className="signup-viz-axis">{date(d.day)}</text>}
            </g>;
          })}
        </svg>
      </div>
      <div className="signup-viz-detail" aria-live="polite"><span>{active && date(active.day, true)}</span><strong>{active && number(active.count)} {en ? active?.count === 1 ? "registration" : "registrations" : active?.count === 1 ? "inscription" : "inscriptions"}</strong></div>
      <div className="signup-viz-footnote"><span>{en ? "Returned registration history · independent of the usage filter" : "Historique retourné · indépendant du filtre d’usage"}</span><span>{data.length === 1 ? en ? "One returned day · no trend inferred" : "Un seul jour retourné · aucune tendance déduite" : en ? "Unreturned days are not plotted" : "Les jours non retournés ne sont pas tracés"}</span></div>
    </div>
  );
}
