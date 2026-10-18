"use client";

import type { UsageStats } from "@/lib/admin-dashboard-types";
import "./admin-section-chart.css";

type SectionRow = UsageStats["sections"][number];

function formatDuration(seconds: number, locale: string): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  const en = locale.toLowerCase().startsWith("en");
  if (hours) return en ? `${hours}h ${minutes}m` : `${hours} h ${minutes} min`;
  if (minutes) return en ? `${minutes}m ${remainder}s` : `${minutes} min ${remainder} s`;
  return en ? `${remainder}s` : `${remainder} s`;
}

function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale.toLowerCase().startsWith("en") ? "en" : "fr", {
    maximumFractionDigits: 1,
  }).format(value);
}

export function AdminSectionChart({ rows, locale }: { rows: UsageStats["sections"]; locale: string }) {
  const en = locale.toLowerCase().startsWith("en");
  const copy = en
    ? { title: "Time by section", description: "Recorded time, ranked from highest to lowest.", empty: "No section activity recorded yet.", duration: "Time", share: "of recorded time", visits: "visits", users: "users", legend: "Recorded time" }
    : { title: "Temps par section", description: "Temps enregistré, classé du plus élevé au plus faible.", empty: "Aucune activité de section enregistrée pour le moment.", duration: "Durée", share: "du temps enregistré", visits: "visites", users: "utilisateurs", legend: "Temps enregistré" };
  const normalized = rows.map((row: SectionRow, index) => ({
    ...row,
    safeSeconds: Number.isFinite(row.seconds) ? Math.max(0, row.seconds) : 0,
    originalIndex: index,
  })).sort((a, b) => b.safeSeconds - a.safeSeconds || a.originalIndex - b.originalIndex);
  const total = normalized.reduce((sum, row) => sum + row.safeSeconds, 0);
  const max = normalized.reduce((value, row) => Math.max(value, row.safeSeconds), 0);
  const ticks = max > 0 ? [0, max / 2, max] : [0];
  const number = new Intl.NumberFormat(en ? "en" : "fr", { maximumFractionDigits: 0 });

  return (
    <section className="admin-section-viz" aria-labelledby="admin-section-viz-title">
      <header className="admin-section-viz__header">
        <div>
          <h2 id="admin-section-viz-title">{copy.title}</h2>
          <p>{copy.description}</p>
        </div>
        <div className="admin-section-viz__legend" aria-label={copy.legend}>
          <span className="admin-section-viz__legend-swatch" aria-hidden="true" />
          <span>{copy.legend}</span>
        </div>
      </header>
      {normalized.length === 0 ? (
        <p className="admin-section-viz__empty">{copy.empty}</p>
      ) : (
        <>
          <div className="admin-section-viz__axis" aria-hidden="true">
            <span />
            <div className="admin-section-viz__ticks">
              {ticks.map((tick, index) => <span key={`${tick}-${index}`}>{formatDuration(tick, locale)}</span>)}
            </div>
            <span />
          </div>
          <ol className="admin-section-viz__list">
            {normalized.map((row, index) => {
              const percent = total > 0 ? (row.safeSeconds / total) * 100 : 0;
              const width = max > 0 ? (row.safeSeconds / max) * 100 : 0;
              const title = `${row.section}: ${formatDuration(row.safeSeconds, locale)} · ${formatPercent(percent, locale)}% ${copy.share} · ${number.format(Math.max(0, row.visits || 0))} ${copy.visits} · ${number.format(Math.max(0, row.users || 0))} ${copy.users}`;
              return (
                <li className="admin-section-viz__row" tabIndex={0} aria-label={title} key={`${row.section}-${row.originalIndex}`}>
                  <div className="admin-section-viz__label" title={title}>{row.section}</div>
                  <div className="admin-section-viz__track" role="img" aria-label={title}>
                    <span className={`admin-section-viz__bar admin-section-viz__bar--${index % 3}`} style={{ width: `${width}%` }} />
                  </div>
                  <div className="admin-section-viz__values">
                    <strong>{formatDuration(row.safeSeconds, locale)}</strong>
                    <span>{formatPercent(percent, locale)}%</span>
                  </div>
                  <div className="admin-section-viz__details">{number.format(Math.max(0, row.visits || 0))} {copy.visits} · {number.format(Math.max(0, row.users || 0))} {copy.users}</div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
