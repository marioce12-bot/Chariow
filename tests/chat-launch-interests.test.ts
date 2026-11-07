import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), admin: vi.fn(), search: vi.fn(), funding: vi.fn(), resources: vi.fn(),
  campaign: vi.fn(), adSet: vi.fn(), ad: vi.fn(), creative: vi.fn(), publish: vi.fn(), remove: vi.fn(),
  image: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "test-token" }));
vi.mock("@/lib/meta/api", () => ({ searchMetaInterests: mocks.search, getMetaAccountFunding: mocks.funding, describeMetaFundingIssue: () => null, fetchMetaResources: mocks.resources }));
vi.mock("@/lib/meta/campaigns", () => ({ createMetaCampaign: mocks.campaign, createMetaAdSet: mocks.adSet, createMetaAd: mocks.ad, createMetaCreative: mocks.creative, createMetaCarouselCreative: vi.fn(), publishMetaAdWithAdvantage: mocks.publish, deleteMetaCampaign: mocks.remove }));
vi.mock("@/lib/meta/ad-image", () => ({ prepareMetaCreativeImage: mocks.image }));
vi.mock("@/lib/meta/ad-video", () => ({ createMetaVideoCreative: vi.fn(), isVideoMediaUrl: () => false, prepareMetaCreativeVideo: vi.fn() }));
import { POST } from "@/app/api/ai/launch-campaign/route";

function query(result: any) {
  const q: any = {};
  for (const method of ["select", "eq", "order"]) q[method] = vi.fn(() => q);
  q.limit = vi.fn().mockResolvedValue(result);
  q.maybeSingle = vi.fn().mockResolvedValue(result);
  q.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return q;
}
const adAccount = [{ id: "row1", meta_account_id: "123", access_token_encrypted: "encrypted", is_selected: true }];
function setup() {
  const storeQuery = query({ data: [{ id: "store1" }], error: null });
  const accountQuery = query({ data: adAccount, error: null });
  const insert = vi.fn().mockResolvedValue({ error: null });
  const adminFrom = vi.fn((table: string) => table === "meta_ad_accounts" ? accountQuery : { insert });
  const supabaseFrom = vi.fn((table: string) => table === "stores" ? storeQuery : query({ data: [], error: null }));
  mocks.auth.mockResolvedValue({ user: { id: "user1" }, supabase: { from: supabaseFrom } });
  mocks.admin.mockReturnValue({ from: adminFrom });
  mocks.funding.mockResolvedValue({});
  mocks.resources.mockResolvedValue({ pages: [{ id: "page1" }] });
  mocks.campaign.mockResolvedValue({ id: "campaign1" });
  mocks.adSet.mockResolvedValue({ id: "adset1" });
  mocks.creative.mockResolvedValue({ id: "creative1" });
  mocks.publish.mockResolvedValue({ id: "ad1" });
  mocks.image.mockResolvedValue({ imageHash: "hash1" });
}
function request(interests: unknown[]) {
  return new Request("https://example.test/api/ai/launch-campaign", { method: "POST", body: JSON.stringify({ name: "Test", message: "Message", imageUrl: "https://example.test/image.jpg", linkUrl: "https://shop.example.test", dailyBudget: 5, currency: "USD", callToAction: "SHOP_NOW", storeId: "store1", pageId: "page1", interests }) });
}
beforeEach(() => { vi.clearAllMocks(); setup(); });

describe("chat campaign interest verification", () => {
  it("passes a Meta-verified object interest into ad set targeting and returns canonical name", async () => {
    mocks.search.mockResolvedValue([{ id: "987", name: "Canonical label" }]);
    const response = await POST(request([{ id: "987", name: "Chosen label" }]));
    expect(response.status).toBe(200);
    expect(mocks.adSet).toHaveBeenCalledWith(expect.objectContaining({ interests: [{ id: "987", name: "Canonical label" }] }));
    expect(await response.json()).toMatchObject({ interests: ["Canonical label"], droppedInterests: [] });
  });
  it("omits and reports an object whose ID is not among Meta search results", async () => {
    mocks.search.mockResolvedValue([{ id: "555", name: "Similar interest" }]);
    const response = await POST(request([{ id: "987", name: "Invented interest" }]));
    expect(response.status).toBe(200);
    expect(mocks.adSet).toHaveBeenCalledWith(expect.objectContaining({ interests: [] }));
    expect(await response.json()).toMatchObject({ interests: [], droppedInterests: ["Invented interest"] });
  });
  it("returns search failure before campaign creation and without rollback deletion", async () => {
    mocks.search.mockRejectedValue(new Error("Meta unavailable"));
    const response = await POST(request([{ id: "987", name: "Chosen label" }]));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "META_INTEREST_SEARCH_FAILED" });
    expect(mocks.campaign).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("keeps an invented legacy string as a 422 exact-match rejection", async () => {
    mocks.search.mockResolvedValue([]);
    const response = await POST(request(["Invented interest"]));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "META_INTEREST_NOT_FOUND" });
    expect(mocks.campaign).not.toHaveBeenCalled();
  });
});
