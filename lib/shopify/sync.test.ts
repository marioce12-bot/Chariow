import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(), filter: vi.fn(), normalize: vi.fn(), saleRows: vi.fn(), notify: vi.fn(), map: vi.fn(), upsert: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => table === "chariow_sales" ? { upsert: mocks.upsert } : { update: () => { const chain: any = { eq: () => chain, then: (resolve: (value: any) => void) => resolve({ error: null }) }; return chain; } } }) }));
vi.mock("@/lib/shopify/client", () => ({ getShopifySnapshot: mocks.snapshot }));
vi.mock("@/lib/shopify/retention", () => ({ filterRetainedShopifySales: mocks.filter }));
vi.mock("@/lib/shopify/analytics", () => ({ normalizeShopifySnapshot: mocks.normalize }));
vi.mock("@/lib/shopify/sales", () => ({ shopifySaleRows: mocks.saleRows }));
vi.mock("@/lib/shopify/notifications", () => ({ notifyShopifySales: mocks.notify }));
vi.mock("@/lib/attribution/auto-map", () => ({ autoMapChariowCampaigns: mocks.map }));
import { syncShopifyStore } from "./sync";

describe("Shopify sync retention boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it("filters raw snapshot sales before normalization, upsert, campaign mapping, and notifications", async () => {
    const old = { id: "gid://shopify/Order/1" };
    const retained = { id: "gid://shopify/Order/2" };
    const snapshot = { sales: { data: [old, retained] }, period: {}, coverage: { sales: { complete: false, reason: "limited" } } };
    mocks.snapshot.mockResolvedValue(snapshot);
    mocks.filter.mockImplementation(async (_admin, _store, sales) => { expect(sales).toEqual([old, retained]); return [retained]; });
    mocks.normalize.mockImplementation((value) => { expect(value.sales.data).toEqual([retained]); return { sales: [retained], products: [], kpis: {} }; });
    const rows = [{ chariow_sale_id: "shopify:store:2" }];
    mocks.saleRows.mockReturnValue(rows);
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.map.mockResolvedValue(0);
    await syncShopifyStore({ id: "store", user_id: "user" });
    expect(mocks.filter).toHaveBeenCalled();
    expect(mocks.normalize).toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith(rows, { onConflict: "chariow_sale_id" });
    expect(mocks.map).toHaveBeenCalledWith(expect.anything(), expect.anything(), rows);
    expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), [retained]);
    expect(mocks.normalize.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.filter.mock.invocationCallOrder[0]);
    expect(mocks.upsert.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.filter.mock.invocationCallOrder[0]);
    expect(mocks.notify.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.filter.mock.invocationCallOrder[0]);
  });
});
