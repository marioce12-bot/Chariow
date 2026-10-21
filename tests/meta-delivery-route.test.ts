import { beforeEach, describe, expect, it, vi } from "vitest";
const { getMetaCreativePatch } = vi.hoisted(() => ({ getMetaCreativePatch: vi.fn() }));
vi.mock("@/lib/meta/creative-sync", () => ({ getMetaCreativePatch }));
const { requireUser, getMetaAdReviewStatus } = vi.hoisted(() => ({ requireUser: vi.fn(), getMetaAdReviewStatus: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "test-token" }));
vi.mock("@/lib/meta/campaigns", async (importOriginal) => ({ ...await importOriginal<typeof import("@/lib/meta/campaigns")>(), getMetaAdReviewStatus }));
import { GET } from "@/app/api/ad-campaigns/[id]/status/route";
let row: any;
let account: any;
let writes: any[];
const snapshot = (effectiveStatus: string, impressions: number | null = null, edited = false) => ({ effectiveStatus, impressions, feedback: null, createdTime: "2026-01-01T00:00:00Z", updatedTime: edited ? "2026-01-01T00:10:00Z" : "2026-01-01T00:00:00Z" });
const get = async () => { const response = await GET(new Request("http://localhost/api/ad-campaigns/c/status"), { params: Promise.resolve({ id: "c" }) }); return { status: response.status, body: await response.json() }; };
beforeEach(() => {
  vi.clearAllMocks(); writes = [];
  getMetaCreativePatch.mockResolvedValue({});
  row = { id: "c", platform: "meta", status: "review", external_ad_id: "a", meta_ad_account_id: "m", external_error: null, meta_delivery_observation: null };
  account = { access_token_encrypted: "encrypted", account_status: 1 };
  const supabase = { from: (table: string) => {
    const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === "ad_campaigns" ? row : account, error: null }), update: (values: any) => { writes.push(values); row = { ...row, ...values }; return query; }, then: (resolve: (result: any) => void) => Promise.resolve({ error: null }).then(resolve) };
    return query;
  } };
  requireUser.mockResolvedValue({ supabase, user: { id: "u" }, response: null });
});
describe("Meta campaign status route delivery evidence", () => {
  it("persists a changed creative even when status and delivery observation stay identical", async () => {
    row.status = "active";
    getMetaAdReviewStatus.mockResolvedValue(snapshot("ACTIVE", 1));
    await get();
    writes.length = 0;
    getMetaCreativePatch.mockResolvedValue({ external_creative_id: "new", media_url: "https://cdn.example/new.jpg", carousel_urls: [] });
    expect((await get()).body.status).toBe("active");
    expect(writes).toHaveLength(1);
    expect(row).toMatchObject({ external_creative_id: "new", media_url: "https://cdn.example/new.jpg", carousel_urls: [] });
  });
  it.each(["paused", "autopilot_paused", "rejected"])("refreshes a %s campaign edited directly in Meta", async (status) => {
    row.status = status;
    getMetaAdReviewStatus.mockResolvedValue(snapshot("ACTIVE", 1));
    getMetaCreativePatch.mockResolvedValue({ media_url: "https://cdn.example/new.jpg" });
    expect((await get()).body.status).toBe("active");
    expect(row.media_url).toBe("https://cdn.example/new.jpg");
  });
  it.each([["PENDING_REVIEW", null, "review"], ["PREPARING", null, "preparing"], ["ACTIVE", 0, "active"], ["ACTIVE", 1, "active"], ["ACTIVE", null, "active"]])("maps fresh %s / %s impressions to %s", async (status, impressions, expected) => {
    getMetaAdReviewStatus.mockResolvedValue(snapshot(status as string, impressions as number | null));
    const result = await get(); expect(result.status).toBe(200); expect(result.body.status).toBe(expected);
    expect(result.body.status_verified).toBe(expected !== "unknown");
  });
  it("corrects the LinkedIn-named Meta row without confusing unchanged impressions with Preparing", async () => {
    row.status = "preparing";
    row.meta_delivery_observation = { ad_id: "a", revision: "2026-01-01T00:10:00.000Z", baseline_impressions: 2, confirmed: false };
    getMetaAdReviewStatus.mockResolvedValue(snapshot("ACTIVE", 2, true));
    expect((await get()).body).toMatchObject({ status: "active", meta_effective_status: "ACTIVE", delivery_evidence: "unknown", status_verified: true });
    expect(writes[0].meta_delivery_observation).toMatchObject({ baseline_impressions: 2, confirmed: false });
    expect((await get()).body.delivery_evidence).toBe("unknown");
    getMetaAdReviewStatus.mockResolvedValue(snapshot("ACTIVE", 3, true));
    expect((await get()).body.status).toBe("active");
    expect(row.meta_delivery_observation.confirmed).toBe(true);
    expect(writes.every((write) => !Object.keys(write).some((key) => key.includes("budget") || key.includes("autopilot")))).toBe(true);
  });
  it("invalidates an Active cache when the account/token is missing", async () => {
    row.status = "active"; account = null;
    expect((await get()).body.status).toBe("unknown");
    expect(row.status).toBe("unknown"); expect(getMetaAdReviewStatus).not.toHaveBeenCalled();
  });
  it("invalidates an Active cache on authentication/network failure without deleting history", async () => {
    row.status = "active"; getMetaAdReviewStatus.mockRejectedValue(new Error("OAuth expired"));
    expect((await get()).body.status).toBe("unknown");
    expect(row.id).toBe("c"); expect(row.status).toBe("unknown");
  });
});
