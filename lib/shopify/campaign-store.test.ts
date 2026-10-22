import { describe, expect, it, vi } from "vitest";
import { resolveCommerceCampaignStore } from "./campaign-store";
import { hasConnectedCommerceStore, hasConnectedChariowStore } from "@/components/dashboard/StoreConnectionGate";
function query(data: unknown[]) {
  const q: any = {};
  q.select = vi.fn(() => q); q.eq = vi.fn(() => q); q.limit = vi.fn(async () => ({ data, error: null }));
  return q;
}
describe("Shopify store selection", () => {
  it("accepts only an owned, explicitly selected active connected Shopify store", async () => {
    const q = query([{ id: "shop", platform: "shopify", is_active: true, connection_status: "connected" }]);
    expect(await resolveCommerceCampaignStore({ from: () => q } as any, "owner", "shop")).toEqual({ ok: true, store: { id: "shop" } });
    expect(q.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(q.eq).toHaveBeenCalledWith("id", "shop");
  });
  it.each(["pending", "revoked", "failed"])("rejects a %s Shopify store", async connection_status => {
    const q = query([{ id: "shop", platform: "shopify", is_active: true, connection_status }]);
    expect((await resolveCommerceCampaignStore({ from: () => q } as any, "owner", "shop")).ok).toBe(false);
  });
  it("unlocks Shopify without changing the legacy Chariow predicate", () => {
    const store = { id: "s", platform: "shopify", store_name: "Demo", mcp_url: null, is_active: true, connection_status: "connected" };
    expect(hasConnectedChariowStore([store])).toBe(false);
    expect(hasConnectedCommerceStore([store])).toBe(true);
    expect(hasConnectedCommerceStore([{ ...store, is_active: false }])).toBe(false);
    expect(hasConnectedCommerceStore([{ ...store, platform: "gumroad" }])).toBe(false);
  });
});
