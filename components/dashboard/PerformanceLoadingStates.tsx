"use client";

import { ImageIcon, Megaphone, Sparkles } from "lucide-react";
import { Skeleton } from "./Skeleton";

export function PerformanceLoadingSkeleton({
  variant,
  locale = "fr",
  compact = false,
}: {
  variant: "visuals" | "campaigns";
  locale?: string;
  compact?: boolean;
}) {
  const en = locale === "en";
  const label = variant === "visuals"
    ? (en ? "Loading measured creative results" : "Chargement des résultats créatifs mesurés")
    : (en ? "Checking campaign recommendations" : "Vérification des propositions de campagne");

  if (variant === "campaigns") {
    return (
      <div className={`performance-loading-skeleton performance-skeleton-campaign${compact ? " is-compact" : ""}`} role="status" aria-busy="true" aria-label={label}>
        <div className="performance-skeleton-campaign-copy" aria-hidden="true">
          <div className="performance-skeleton-heading"><Skeleton width={42} height={42} radius={12} /><div><Skeleton width="42%" height={13} /><Skeleton width="78%" height={10} style={{ marginTop: 9 }} /></div></div>
          <div className="performance-skeleton-lines"><Skeleton width="92%" height={12} /><Skeleton width="76%" height={12} /><Skeleton width="84%" height={12} /><Skeleton width="64%" height={12} /></div>
          {!compact ? <div className="performance-skeleton-actions"><Skeleton width="45%" height={38} radius={9} /><Skeleton width="35%" height={38} radius={9} /></div> : null}
        </div>
        {!compact ? <div className="performance-skeleton-phone" aria-hidden="true"><Skeleton width="100%" height="100%" radius={21} /></div> : null}
      </div>
    );
  }

  return (
    <div className="performance-loading-skeleton performance-skeleton-visuals" role="status" aria-busy="true" aria-label={label}>
      <div className="performance-skeleton-kpis" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <div className="performance-skeleton-kpi" key={index}><Skeleton width={42} height={42} radius={11} /><div><Skeleton width="62%" height={9} /><Skeleton width="48%" height={18} style={{ marginTop: 8 }} /><Skeleton width="72%" height={8} style={{ marginTop: 6 }} /></div></div>)}
      </div>
      <div className="performance-skeleton-insights" aria-hidden="true">
        {Array.from({ length: 2 }, (_, index) => <div className="performance-skeleton-insight" key={index}><Skeleton width={38} height={38} radius={10} /><div><Skeleton width="45%" height={8} /><Skeleton width="72%" height={11} style={{ marginTop: 7 }} /><Skeleton width="57%" height={8} style={{ marginTop: 6 }} /></div></div>)}
      </div>
      <div className="performance-skeleton-table" aria-hidden="true">
        <div className="performance-skeleton-table-head"><div><Skeleton width={148} height={16} /><Skeleton width={236} height={9} style={{ marginTop: 8 }} /></div><Skeleton width={100} height={34} radius={9} /></div>
        {Array.from({ length: 3 }, (_, index) => <div className="performance-skeleton-table-row" key={index}><Skeleton width={48} height={48} radius={9} /><div><Skeleton width="70%" height={10} /><Skeleton width="48%" height={8} style={{ marginTop: 7 }} /></div><Skeleton width={50} height={10} /><Skeleton width={50} height={10} /></div>)}
      </div>
    </div>
  );
}

export function PerformanceEmptyState({
  variant,
  locale = "fr",
}: {
  variant: "visuals" | "campaigns";
  locale?: string;
}) {
  const en = locale === "en";
  const visual = variant === "visuals";
  const Icon = visual ? ImageIcon : Megaphone;
  return (
    <section className={`performance-empty-state performance-empty-${variant}`} role="status" aria-live="polite">
      <div className="performance-empty-orbit" aria-hidden="true"><span /><Icon size={22} strokeWidth={1.8} /><Sparkles className="performance-empty-sparkle" size={13} strokeWidth={2} /></div>
      <h2>{visual ? (en ? "No data to show yet" : "Aucune donnée pour le moment") : (en ? "No recommendation yet" : "Aucune proposition pour le moment")}</h2>
      <p>{visual
        ? (en ? "Vendeo will let you know when new measured results are available." : "Vendeo vous informera dès que de nouveaux résultats mesurés seront disponibles.")
        : (en ? "Vendeo will let you know when a new recommendation is available." : "Vendeo vous informera dès qu’une nouvelle proposition sera disponible.")}</p>
    </section>
  );
}
