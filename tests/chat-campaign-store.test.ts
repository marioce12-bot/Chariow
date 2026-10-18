import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveChatCampaignStore } from "@/lib/chariow/campaign-store";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), pinterest: vi.fn(), meta: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/pinterest/api", () => ({ launchPinterest: mocks.pinterest }));
vi.mock("@/lib/meta/campaigns", () => ({ createMetaCampaign: mocks.meta, createMetaAdSet: mocks.meta, createMetaAd: mocks.meta, createMetaCreative: mocks.meta, createMetaCarouselCreative: mocks.meta, publishMetaAdWithAdvantage: mocks.meta, deleteMetaCampaign: mocks.meta }));
import { POST } from "@/app/api/ai/launch-campaign/route";

function storeQuery(data: Array<{ id: string }> | null, error: unknown = null) {
  const q: any = {};
  for (const key of ["select", "eq"]) q[key] = vi.fn(() => q);
  q.limit = vi.fn().mockResolvedValue({ data, error });
  return q;
}
beforeEach(() => vi.clearAllMocks());
describe("chat campaign store ownership", () => {
  it("selects the requested connected Chariow store and checks its owner", async () => {
    const q = storeQuery([{ id: "store-second" }]);
    const result = await resolveChatCampaignStore({ from: () => q } as any, "owner", "store-second");
    expect(result).toEqual({ ok: true, store: { id: "store-second" } });
    for (const pair of [["user_id", "owner"], ["id", "store-second"], ["platform", "chariow"], ["is_active", true], ["connection_status", "connected"]]) expect(q.eq).toHaveBeenCalledWith(...pair);
  });
  it("does not fall back to another store for an inaccessible selection", async () => {
    expect(await resolveChatCampaignStore({ from: () => storeQuery([]) } as any, "owner", "other-owner-store")).toEqual({ ok: false, code: "STORE_NOT_FOUND" });
  });
  it("requires a choice when multiple stores are connected", async () => {
    expect(await resolveChatCampaignStore({ from: () => storeQuery([{ id: "one" }, { id: "two" }]) } as any, "owner")).toEqual({ ok: false, code: "STORE_SELECTION_REQUIRED" });
  });
  it("keeps legacy single-store requests working", async () => {
    expect((await resolveChatCampaignStore({ from: () => storeQuery([{ id: "one" }]) } as any, "owner")).ok).toBe(true);
  });
});
function request(extra: Record<string, unknown> = {}) {
  return new Request("https://example.test/api/ai/launch-campaign", { method: "POST", body: JSON.stringify({ name: "Guide", message: "Read this guide", imageUrl: "https://example.test/image.jpg", linkUrl: "https://shop.mychariow.shop/prd_guide", dailyBudget: 5, currency: "USD", callToAction: "SHOP_NOW", storeId: "store-second", ...extra }) });
}
describe("chat launch channel guards (no advertising calls)", () => {
  it.each(["meta", "pinterest"])("%s respects the selected store and stops before launching without an ad account", async platform => {
    const q = storeQuery([{ id: "store-second" }]);
    const accounts: any = {};
    for (const key of ["select", "eq"]) accounts[key] = vi.fn(() => accounts);
    accounts.order = vi.fn().mockResolvedValue({ data: [] });
    accounts.then = (resolve: any) => Promise.resolve({ data: [] }).then(resolve);
    const from = vi.fn((table: string) => table === "stores" ? q : accounts);
    mocks.auth.mockResolvedValue({ user: { id: "owner" }, supabase: { from } });
    mocks.admin.mockReturnValue({ from });
    const response = await POST(request({ platform }));
    expect(response.status).toBe(400);
    expect(q.eq).toHaveBeenCalledWith("id", "store-second");
    expect(mocks.meta).not.toHaveBeenCalled(); expect(mocks.pinterest).not.toHaveBeenCalled();
  });
  it.each(["fr", "en"])("%s asks for store selection rather than an URL on ambiguity", async locale => {
    const q = storeQuery([{ id: "one" }, { id: "two" }]);
    mocks.auth.mockResolvedValue({ user: { id: "owner" }, supabase: { from: () => q } });
    const response = await POST(request({ storeId: undefined, locale }));
    const body = await response.json();
    expect(body.code).toBe("STORE_SELECTION_REQUIRED");
    expect(body.error).toContain(locale === "en" ? "Choose the product" : "Choisis le produit");
    expect(mocks.meta).not.toHaveBeenCalled(); expect(mocks.pinterest).not.toHaveBeenCalled();
  });
  it("keeps TikTok in the wizard and makes no advertising call", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "owner" }, supabase: {} });
    const response = await POST(request({ platform: "tiktok" }));
    expect((await response.json()).code).toBe("PLATFORM_NOT_SUPPORTED");
    expect(mocks.meta).not.toHaveBeenCalled(); expect(mocks.pinterest).not.toHaveBeenCalled();
  });
});
