import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
const mocks = vi.hoisted(() => ({ getSnapshot: vi.fn(), filter: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/shopify/client", () => ({ getShopifySnapshot: mocks.getSnapshot }));
vi.mock("@/lib/shopify/retention", () => ({ filterRetainedShopifySales: mocks.filter }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import { getPrivateShopifySnapshot } from "./private-snapshot";
import { normalizeShopifySnapshot } from "./analytics";
beforeEach(() => { vi.clearAllMocks(); });
describe("Shopify assistant privacy context", () => {
  it("filters orders before serializing sales and computing the AI context KPIs", async () => {
    const order = (id: string, amount: string) => ({ id: `gid://shopify/Order/${id}`, createdAt: new Date().toISOString(), displayFinancialStatus: "PAID", totalPriceSet: { shopMoney: { amount, currencyCode: "EUR" } } });
    const allowed = order("1", "20"), redacted = order("2", "999");
    const snapshot = { store: { id: "a" }, products: { data: [] }, sales: { data: [allowed, redacted] }, period: { from: "2026-10-01", to: "2026-10-23" } };
    const admin = {};
    mocks.admin.mockReturnValue(admin);
    mocks.getSnapshot.mockResolvedValue(snapshot);
    mocks.filter.mockResolvedValue([allowed]);
    const result = await getPrivateShopifySnapshot({ id: "a" });
    expect(mocks.filter).toHaveBeenCalledWith(admin, "a", snapshot.sales.data);
    const normalized = normalizeShopifySnapshot(result);
    expect(normalized.sales).toHaveLength(1);
    expect(normalized.kpis.revenue.value).toBe(20);
    expect(JSON.stringify(normalized)).not.toContain("999");
    expect(snapshot.sales.data).toHaveLength(2);
  });
  it("fails closed instead of exposing the unfiltered snapshot", async () => {
    mocks.getSnapshot.mockResolvedValue({ sales: { data: [{ id: "gid://shopify/Order/2" }] } });
    mocks.filter.mockRejectedValue(new Error("retention unavailable"));
    await expect(getPrivateShopifySnapshot({ id: "a" })).rejects.toThrow("retention unavailable");
  });
  it("routes the chat through the privacy-aware snapshot", () => {
    const source = fs.readFileSync(path.resolve("app/api/chat/route.ts"), "utf8");
    expect(source).toContain('import("@/lib/shopify/private-snapshot")');
    expect(source).toContain("await getPrivateShopifySnapshot(store)");
    expect(source).not.toContain("await getShopifySnapshot(store)");
  });
  it("does not fetch orders for catalogue-only attribution and connection checks", () => {
    for (const file of ["app/api/attribution/campaigns/route.ts", "app/api/stores/[id]/test/route.ts"]) {
      const source = fs.readFileSync(path.resolve(file), "utf8");
      expect(source).toContain("getShopifyProductSnapshot");
      expect(source).not.toContain("getShopifySnapshot");
    }
  });
});
