export type DashboardAnalyticsPeriodRange = { from: string; to: string };
export type DashboardAnalyticsPeriods = { calendarMonth: DashboardAnalyticsPeriodRange; rolling30Days: DashboardAnalyticsPeriodRange };
export type DashboardAnalyticsSnapshotResponse<T> = { snapshot?: T | null } | null | undefined;
export const DASHBOARD_ANALYTICS_REFRESH_MS = 5 * 60_000;

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Preserve the existing UTC date bounds used by OverviewHome for selectable periods. */
export function getDashboardAnalyticsRange(days: number, now = new Date()): DashboardAnalyticsPeriodRange {
  const to = dateKey(now);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - days + 1);
  return { from: dateKey(fromDate), to };
}

/** Use one client-facing request for the dashboard and its currently selected period. */
export function getDashboardAnalyticsUrl(storeId: string, periodDays = 30, now = new Date()) {
  const params = new URLSearchParams({ store_id: storeId, dashboard_periods: "1" });
  if (periodDays === 7 || periodDays === 90) {
    const range = getDashboardAnalyticsRange(periodDays, now);
    params.set("from", range.from);
    params.set("to", range.to);
  }
  return `/api/analytics?${params.toString()}`;
}

/** These ranges mirror the former Dashboard month request and OverviewHome 30-day request. */
export function getDashboardAnalyticsPeriods(now = new Date()): DashboardAnalyticsPeriods {
  const to = dateKey(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    calendarMonth: { from: dateKey(monthStart), to },
    rolling30Days: getDashboardAnalyticsRange(30, now),
  };
}

/** Keep the month, rolling-30, and optional selected-period snapshots distinct and unchanged. */
export function shareDashboardAnalyticsSnapshots<T>(
  calendarMonthResponse: DashboardAnalyticsSnapshotResponse<T>,
  rolling30Response: DashboardAnalyticsSnapshotResponse<T>,
  selectedPeriodResponse?: DashboardAnalyticsSnapshotResponse<T>,
) {
  return {
    snapshot: calendarMonthResponse?.snapshot ?? null,
    rolling30Snapshot: rolling30Response?.snapshot ?? null,
    periodSnapshot: selectedPeriodResponse?.snapshot ?? null,
  };
}
