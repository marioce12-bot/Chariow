import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  normalize: vi.fn(),
  adminFrom: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => ({
    user: { id: "user-1" },
    supabase: {
      from: () => {
        const query: any = {
          select: () => query,
          eq: () => query,
          limit: () => query,
          maybeSingle: async () => ({
            data: { id: "store-1", platform: "chariow", store_name: "Fixture store", mcp_url: "mock://fixture", access_token_encrypted: null, connection_status: "connected", connected_at: "2026-01-01T00:00:00.000Z" },
            error: null,
          }),
        };
        return query;
      },
    },
    response: null,
  }),
}));
vi.mock("@/lib/chariow/analytics", () => ({ getChariowSnapshot: mocks.getSnapshot, normalizeChariowSnapshot: mocks.normalize }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.adminFrom }) }));
vi.mock("@/lib/chariow/sales-rows", () => ({ chariowSaleRows: () => [] }));
vi.mock("@/lib/chariow/sale-details", () => ({ mergeSaleDetails: (sales: unknown) => sales }));
vi.mock("@/lib/chariow/sale-notifications", () => ({ notifyChariowSales: vi.fn() }));
vi.mock("@/lib/paginated-query", () => ({ fetchAllPages: async () => ({ rows: [], error: null }) }));

import { GET } from "./route";
import { getDashboardAnalyticsPeriods } from "@/lib/dashboard-analytics-periods";

function request(query: string) {
  return new Request(`https://example.invalid/api/analytics?${query}`);
}

function adminChain() {
  const chain: any = {
    update: () => chain,
    eq: () => chain,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-25T08:55:58+01:00"));
  mocks.adminFrom.mockReturnValue(adminChain());
  mocks.getSnapshot.mockImplementation(async (_store: unknown, opts: { from?: string; to?: string }) => ({
    marker: opts.from ? "rolling-30" : "calendar-month",
    store: { name: "Fixture store", currency: "XOF" },
    products: { data: [] },
    sales: { data: [] },
    salesAnalytics: {},
    storeAnalytics: {},
    coverage: { sales: { complete: true } },
  }));
  mocks.normalize.mockImplementation((snapshot: { marker: string }, period: { from: string; to: string }) => {
    const from = period.from || "2026-10-01";
    const to = period.to || "2026-10-25";
    const isMonth = snapshot.marker === "calendar-month";
    return {
      storeName: "Fixture store",
      storeStatus: "connected",
      products: [],
      sales: [],
      kpis: {
        period: { from, to },
        revenue: { value: isMonth ? 84000 : 96500, formatted: isMonth ? "84 000 XOF" : "96 500 XOF" },
        revenueByCurrency: [],
        sales: isMonth ? 12 : 15,
        visits: isMonth ? 320 : 410,
        conversionRate: isMonth ? "3,75 %" : "3,66 %",
        customers: isMonth ? 9 : 11,
        productsSold: isMonth ? 12 : 15,
      },
    };
  });
});

afterEach(() => vi.useRealTimers());

describe("GET /api/analytics dashboard period bundle", () => {
  it("matches both legacy period responses exactly while returning one distinct snapshot per period", async () => {
    const ranges = getDashboardAnalyticsPeriods(new Date());
    const monthBeforeResponse = await GET(request("store_id=store-1"));
    const monthBefore = await monthBeforeResponse.json();
    const rollingBeforeResponse = await GET(request(`store_id=store-1&from=${ranges.rolling30Days.from}&to=${ranges.rolling30Days.to}`));
    const rollingBefore = await rollingBeforeResponse.json();

    const combinedResponse = await GET(request("store_id=store-1&dashboard_periods=1"));
    const combined = await combinedResponse.json();

    expect(combinedResponse.status).toBe(200);
    expect(combined.snapshot).toEqual(monthBefore.snapshot);
    expect(combined.rolling30Snapshot).toEqual(rollingBefore.snapshot);
    expect(combined.snapshot.kpis.period).toEqual({ from: "2026-10-01", to: "2026-10-25" });
    expect(combined.rolling30Snapshot.kpis.period).toEqual(ranges.rolling30Days);
    expect(combined.snapshot.kpis.visits).toBe(320);
    expect(combined.rolling30Snapshot.kpis.visits).toBe(410);
    expect(combined.snapshot.overview.period).not.toEqual(combined.rolling30Snapshot.overview.period);
    expect(combined.periodError).toBeNull();
  });
});
