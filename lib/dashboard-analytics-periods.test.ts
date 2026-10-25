import { afterEach, describe, expect, it, vi } from "vitest";
import { getDashboardAnalyticsPeriods, getDashboardAnalyticsRange, getDashboardAnalyticsUrl, shareDashboardAnalyticsSnapshots } from "./dashboard-analytics-periods";

afterEach(() => vi.useRealTimers());

describe("Dashboard analytics periods", () => {
  it("reproduces the existing calendar-month and rolling-30 date ranges at a frozen clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T08:55:58+01:00"));

    // Former Dashboard default: the server's current calendar month.
    const legacyMonthNow = new Date();
    const legacyMonthFrom = new Date(legacyMonthNow.getFullYear(), legacyMonthNow.getMonth(), 1).toISOString().slice(0, 10);
    const legacyMonthTo = legacyMonthNow.toISOString().slice(0, 10);

    // Former OverviewHome default: today and the preceding 29 calendar dates.
    const legacyRollingToDate = new Date();
    const legacyRollingFromDate = new Date(legacyRollingToDate);
    legacyRollingFromDate.setDate(legacyRollingToDate.getDate() - 30 + 1);
    const legacyRolling = {
      from: legacyRollingFromDate.toISOString().slice(0, 10),
      to: legacyRollingToDate.toISOString().slice(0, 10),
    };

    expect(getDashboardAnalyticsPeriods()).toEqual({
      calendarMonth: { from: legacyMonthFrom, to: legacyMonthTo },
      rolling30Days: legacyRolling,
    });
  });

  it("shares the same two legacy responses without merging or changing any displayed values", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T08:55:58+01:00"));
    const calendarMonthSnapshot = {
      kpis: { period: { from: "2026-10-01", to: "2026-10-25" }, sales: 12, visits: 320, conversionRate: "3,75 %" },
      overview: { period: { from: "2026-10-01", to: "2026-10-25" }, revenueNet: 84000, revenueChangePct: 8.4 },
    };
    const rolling30Snapshot = {
      kpis: { period: { from: "2026-09-26", to: "2026-10-25" }, sales: 15, visits: 410, conversionRate: "3,66 %" },
      overview: { period: { from: "2026-09-26", to: "2026-10-25" }, revenueNet: 96500, revenueChangePct: 11.2 },
    };

    // The former client received these as two independent responses.
    const before = { dashboard: calendarMonthSnapshot, overview: rolling30Snapshot };
    // The new transport carries those same results in one response envelope.
    const after = shareDashboardAnalyticsSnapshots(
      { snapshot: calendarMonthSnapshot },
      { snapshot: rolling30Snapshot },
    );

    expect(after).toEqual({ snapshot: before.dashboard, rolling30Snapshot: before.overview, periodSnapshot: null });
    expect(after.snapshot).not.toBe(after.rolling30Snapshot);
    expect(after.snapshot?.kpis.period).not.toEqual(after.rolling30Snapshot?.kpis.period);
  });

  it.each([7, 90])("uses one client analytics URL for the %s-day view and preserves its exact date range", days => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T08:55:58+01:00"));
    const url = getDashboardAnalyticsUrl("store/one", days, new Date());
    const parsed = new URL(url, "https://vendeo.example");
    const expectedRange = getDashboardAnalyticsRange(days, new Date());

    expect(parsed.pathname).toBe("/api/analytics");
    expect(parsed.searchParams.get("store_id")).toBe("store/one");
    expect(parsed.searchParams.get("dashboard_periods")).toBe("1");
    expect(parsed.searchParams.get("from")).toBe(expectedRange.from);
    expect(parsed.searchParams.get("to")).toBe(expectedRange.to);
    expect(url.split("/api/analytics")).toHaveLength(2);
  });

  it("shares the selected-period response without merging its values into the month or rolling-30 snapshots", () => {
    const month = { kpis: { period: { from: "2026-10-01", to: "2026-10-25" }, sales: 12 } };
    const rolling30 = { kpis: { period: { from: "2026-09-26", to: "2026-10-25" }, sales: 15 } };
    const selectedPeriod = { kpis: { period: { from: "2026-10-19", to: "2026-10-25" }, sales: 4 } };

    const shared = shareDashboardAnalyticsSnapshots(
      { snapshot: month },
      { snapshot: rolling30 },
      { snapshot: selectedPeriod },
    );

    expect(shared).toEqual({ snapshot: month, rolling30Snapshot: rolling30, periodSnapshot: selectedPeriod });
    expect(shared.snapshot).not.toBe(shared.rolling30Snapshot);
    expect(shared.periodSnapshot).not.toBe(shared.rolling30Snapshot);
    expect(shared.periodSnapshot?.kpis.period).toEqual({ from: "2026-10-19", to: "2026-10-25" });
  });
});
