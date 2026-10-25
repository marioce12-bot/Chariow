import { afterEach, describe, expect, it, vi } from "vitest";
import { getDashboardAnalyticsPeriods, shareDashboardAnalyticsSnapshots } from "./dashboard-analytics-periods";

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

    expect(after).toEqual({ snapshot: before.dashboard, rolling30Snapshot: before.overview });
    expect(after.snapshot).not.toBe(after.rolling30Snapshot);
    expect(after.snapshot?.kpis.period).not.toEqual(after.rolling30Snapshot?.kpis.period);
  });
});
