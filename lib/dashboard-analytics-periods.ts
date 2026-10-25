export type DashboardAnalyticsPeriodRange = { from: string; to: string };
export type DashboardAnalyticsPeriods = { calendarMonth: DashboardAnalyticsPeriodRange; rolling30Days: DashboardAnalyticsPeriodRange };
export type DashboardAnalyticsSnapshotResponse<T> = { snapshot?: T | null } | null | undefined;
export const DASHBOARD_ANALYTICS_REFRESH_MS = 5 * 60_000;

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** These ranges mirror the former Dashboard month request and OverviewHome 30-day request. */
export function getDashboardAnalyticsPeriods(now = new Date()): DashboardAnalyticsPeriods {
  const to = dateKey(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const rollingStart = new Date(now);
  rollingStart.setDate(rollingStart.getDate() - 29);
  return {
    calendarMonth: { from: dateKey(monthStart), to },
    rolling30Days: { from: dateKey(rollingStart), to },
  };
}

/** Keep the legacy month snapshot and rolling-30 snapshot distinct and unchanged. */
export function shareDashboardAnalyticsSnapshots<T>(
  calendarMonthResponse: DashboardAnalyticsSnapshotResponse<T>,
  rolling30Response: DashboardAnalyticsSnapshotResponse<T>,
) {
  return {
    snapshot: calendarMonthResponse?.snapshot ?? null,
    rolling30Snapshot: rolling30Response?.snapshot ?? null,
  };
}
