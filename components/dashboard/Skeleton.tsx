"use client";
import { useI18n } from "@/lib/i18n/i18n";
import { dashboardCopy } from "@/lib/i18n/dashboard-copy";

import type { CSSProperties } from "react";
import "@/app/dashboard-skeleton.css";

type SkeletonProps = { width?: number | string; height?: number | string; radius?: number | string; style?: CSSProperties };

/** Bloc gris animé (effet « shimmer ») qui réserve la place du vrai contenu pendant le chargement. */
export function Skeleton({ width = "100%", height = 12, radius, style }: SkeletonProps) {
  return <span className="sk" aria-hidden="true" style={{ width, height, ...(radius !== undefined ? { borderRadius: radius } : {}), ...style }} />;
}

/** Lignes de liste (vignette + deux lignes de texte + valeur à droite). */
export function SkeletonRows({ count = 3, thumb = 40, label }: { count?: number; thumb?: number; label?: string }) {
  const { t } = useI18n();
  return (
    <div className="sk-list" role="status" aria-busy="true" aria-label={label ?? t("interfaceExtra.loading")}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="sk-row">
          <Skeleton width={thumb} height={thumb} radius={10} style={{ flexShrink: 0 }} />
          <div className="sk-stack">
            <Skeleton width="55%" height={13} />
            <Skeleton width="35%" height={10} />
          </div>
          <Skeleton width={56} height={14} style={{ flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}

/** Squelette de toute la page, affiché pendant le premier chargement de l'espace. */
export function DashboardSkeleton() {
  const { locale } = useI18n();
  return (
    <div className="dashboard-home" style={{ display: "grid", gap: 18 }} role="status" aria-busy="true" aria-label={dashboardCopy[locale]["dashboardExtra.ariaLoading"]}>
      <section className="app-card">
        <Skeleton width={90} height={10} />
        <Skeleton width="55%" height={26} style={{ margin: "10px 0 8px" }} />
        <Skeleton width="80%" height={12} />
        <div className="ov-kpi-grid" style={{ marginTop: 14 }}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="ov-kpi">
              <Skeleton width="50%" height={11} />
              <Skeleton width="40%" height={24} style={{ marginTop: 8 }} />
            </div>
          ))}
        </div>
      </section>
      {[3, 3, 4].map((rows, index) => (
        <section key={index} className="app-card">
          <Skeleton width="40%" height={18} />
          <SkeletonRows count={rows} />
        </section>
      ))}
    </div>
  );
}
