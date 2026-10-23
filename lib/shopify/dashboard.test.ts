import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), filter: vi.fn(), normalize: vi.fn(), saleRows: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ upsert: async () => ({ error: null }), update: () => { const chain: any = { eq: () => chain, then: (resolve: (value: any) => void) => resolve({ error: null }) }; return chain; } }) }) }));
vi.mock("./client", () => ({ getShopifySnapshot: mocks.snapshot }));
vi.mock("./retention", () => ({ filterRetainedShopifySales: mocks.filter, retentionCutoff: () => "2025-01-01T12:34:56.000Z" }));
vi.mock("./analytics", () => ({ normalizeShopifySnapshot: mocks.normalize }));
vi.mock("./sales", () => ({ shopifySaleRows: mocks.saleRows }));
vi.mock("@/lib/paginated-query", () => ({ fetchAllPages: (builder: any) => { const query = builder(0, 999); mocks.fetch(query); return Promise.resolve({ rows: [], error: null }); } }));
import { shopifyDashboardResponse } from "./dashboard";

describe("Shopify dashboard retention range", () => {
  it("bounds both KPI ranges by the retention timestamp and never reports a truncated range complete", async () => {
    mocks.snapshot.mockResolvedValue({ sales: { data: [] }, period: { from: "2024-10-01", to: "2025-02-01" }, coverage: { sales: { complete: true } }, store: { currencyCode: "USD" } });
    mocks.filter.mockResolvedValue([]);
    mocks.normalize.mockReturnValue({ sales: [], products: [], kpis: { revenueByCurrency: [] }, storeName: "Store" });
    mocks.saleRows.mockReturnValue([]);
    const gte = vi.fn(() => chain);
    const chain: any = { select: () => chain, eq: () => chain, gte, lte: () => chain, order: () => chain, range: () => chain };
    const response = await shopifyDashboardResponse({ from: () => chain }, "user", { id: "store", store_name: "Store" }, {});
    const body = await response.json();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(gte).toHaveBeenCalledWith("occurred_at", "2025-01-01T12:34:56.000Z");
    expect(gte).toHaveBeenCalledWith("occurred_at", "2025-01-01T00:00:00.000Z");
    expect(body.snapshot.overview).toBeNull();
  });
});
