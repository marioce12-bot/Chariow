import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { canonicalShopifyOrderId, filterRetainedShopifySales, retentionCutoff } from "./retention";
const now = new Date("2025-04-01T00:00:00.000Z");
const order = (id: string, createdAt = "2025-03-01T00:00:00Z") => ({ id: `gid://shopify/Order/${id}`, createdAt });
const hash = (id: string) => createHash("sha256").update(id).digest("hex");
function admin(markers: string[] = [], fail = false) {
  const markerChain: any = {
    select: vi.fn(() => markerChain), eq: vi.fn(() => markerChain),
    in: vi.fn(async (_column: string, hashes: string[]) => ({ data: fail ? null : markers.filter(x => hashes.includes(x)).map(order_id_hash => ({ order_id_hash })), error: fail ? new Error("unavailable") : null })),
  };
  const storeChain: any = { select: vi.fn(() => storeChain), eq: vi.fn(() => storeChain), maybeSingle: vi.fn(async () => ({ data: { shop_domain: "x.myshopify.com" }, error: null })) };
  return { from: vi.fn((table: string) => table === "stores" ? storeChain : markerChain), markerChain, storeChain };
}
describe("Shopify retention", () => {
  it("uses the exact 90-day cutoff", () => expect(retentionCutoff(now)).toBe("2025-01-01T00:00:00.000Z"));
  it("accepts canonical positive GIDs only and bounds their size", () => {
    expect(canonicalShopifyOrderId("gid://shopify/Order/123")).toBe("123");
    for (const id of ["123", "gid://shopify/Order/x", "gid://shopify/Order/0", "gid://shopify/Order/01", `gid://shopify/Order/${"1".repeat(31)}`]) expect(canonicalShopifyOrderId(id)).toBeNull();
  });
  it("rejects unknown/invalid raw dates and applies the 90-day boundary to valid incoming dates", async () => {
    const a = admin([hash("2")]);
    const rows = [order("1"), order("2"), order("3", "bad"), { id: "bad", createdAt: "2025-03-01" }, order("4", "2025-01-01T00:00:00.000Z"), order("5", "2025-01-01T00:00:00.001Z")];
    expect((await filterRetainedShopifySales(a, "store", rows, now)).map(x => x.id)).toEqual([order("1").id, order("5").id]);
    // This raw-ingestion policy is separate from database cleanup: historical rows
    // with a missing occurred_at use shopify_first_observed_at in the purge RPC.
    expect(rows.some(x => x.createdAt === "bad" || !x.createdAt)).toBe(true);
  });
  it("scopes store and markers by Shopify platform and shop domain", async () => {
    const a = admin();
    await filterRetainedShopifySales(a, "store", [order("1")], now);
    expect(a.storeChain.eq.mock.calls).toEqual([["id", "store"], ["platform", "shopify"]]);
    expect(a.markerChain.eq).toHaveBeenCalledWith("shop_domain", "x.myshopify.com");
    expect(a.markerChain.in).toHaveBeenCalledWith("order_id_hash", [hash("1")]);
  });
  it("fails closed on marker lookup errors", async () => {
    await expect(filterRetainedShopifySales(admin([], true), "s", [order("1")], now)).rejects.toThrow();
  });
  it("fails closed on missing stores, domains or store lookup failures", async () => {
    for (const result of [{ data: null, error: null }, { data: { shop_domain: null }, error: null }, { data: null, error: new Error("lookup failed") }]) {
      const a = admin(); a.storeChain.maybeSingle.mockResolvedValue(result);
      await expect(filterRetainedShopifySales(a, "s", [order("1")], now)).rejects.toThrow();
      expect(a.markerChain.in).not.toHaveBeenCalled();
    }
  });
  it("queries only candidate hashes in bounded batches, beyond API default row caps", async () => {
    const ids = Array.from({ length: 1201 }, (_, index) => String(index + 1));
    const a = admin(ids.map(hash));
    expect(await filterRetainedShopifySales(a, "s", ids.map(id => order(id)), now)).toEqual([]);
    expect(a.markerChain.in.mock.calls.map((call: any[]) => call[1].length)).toEqual([500, 500, 201]);
  });
  it("does not query denial markers when there are no retained candidates", async () => {
    const a = admin();
    expect(await filterRetainedShopifySales(a, "s", [order("1", "2024-01-01")], now)).toEqual([]);
    expect(a.markerChain.in).not.toHaveBeenCalled();
  });
});
