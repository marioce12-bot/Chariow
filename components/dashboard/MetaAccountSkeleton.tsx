"use client";
import { useI18n } from "@/lib/i18n/i18n";
import "@/app/styles/meta-account-skeleton.css";

const activityRows = [0, 1, 2];
const pixelRows = [0, 1, 2];
const kpis = [0, 1, 2, 3, 4];

/** Placeholder for account data only; the account selector and its toolbar remain outside this component. */
export function MetaAccountSkeleton() {
  const { t } = useI18n();
  return (
    <div className="meta-account-skeleton" role="status" aria-busy="true" aria-label={t("interfaceExtra.metaLoading")}>
      <div className="mas-kpis" aria-hidden="true">
        {kpis.map((item) => (
          <div className="mas-card mas-kpi" key={item}>
            <span className="mas-shape mas-label" />
            <span className="mas-shape mas-amount" />
            <span className="mas-shape mas-caption" />
          </div>
        ))}
      </div>

      <section className="mas-card mas-activity" aria-hidden="true">
        <div className="mas-section-heading">
          <span className="mas-shape mas-heading" />
          <span className="mas-shape mas-control" />
        </div>
        <div className="mas-chart">
          <div className="mas-chart-guides"><i /><i /><i /><i /></div>
          <svg viewBox="0 0 720 150" preserveAspectRatio="none" focusable="false">
            <path className="mas-chart-fill" d="M0 126 C50 120 56 70 112 82 S170 113 225 84 S282 53 336 72 S390 112 448 65 S510 78 560 45 S625 69 670 28 S704 43 720 18 L720 150 L0 150 Z" />
            <path className="mas-chart-line" d="M0 126 C50 120 56 70 112 82 S170 113 225 84 S282 53 336 72 S390 112 448 65 S510 78 560 45 S625 69 670 28 S704 43 720 18" />
          </svg>
        </div>
        <div className="mas-axis"><span className="mas-shape" /><span className="mas-shape" /><span className="mas-shape" /><span className="mas-shape" /></div>
      </section>

      <section className="mas-card mas-pixels" aria-hidden="true">
        <div className="mas-section-heading"><span className="mas-shape mas-heading" /></div>
        {pixelRows.map((item) => (
          <div className="mas-pixel-row" key={item}>
            <span className="mas-shape mas-pixel-icon" />
            <div className="mas-pixel-copy"><span className="mas-shape mas-pixel-name" /><span className="mas-shape mas-pixel-detail" /><span className="mas-shape mas-pixel-meta" /></div>
            <span className="mas-shape mas-pixel-trailing" />
          </div>
        ))}
      </section>

      <section className="mas-card mas-table" aria-hidden="true">
        <div className="mas-section-heading"><span className="mas-shape mas-heading" /><span className="mas-shape mas-control" /></div>
        <div className="mas-table-header"><span /><span /><span /><span /></div>
        {activityRows.map((item) => <div className="mas-table-row" key={item}><span /><span /><span /><span /></div>)}
      </section>
    </div>
  );
}
