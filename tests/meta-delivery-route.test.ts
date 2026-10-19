import { beforeEach, describe, expect, it, vi } from "vitest";
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
  row = { id: "c", platform: "meta", status: "review", external_ad_id: "a", meta_ad_account_id: "m", external_error: null, meta_delivery_observation: null };
  account = { access_token_encrypted: "encrypted", account_status: 1 };
  const supabase = { from: (table: string) => {
    const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === "ad_campaigns" ? row : account, error: null }), update: (values: any) => { writes.push(values); row = { ...row, ...values }; return query; }, then: (resolve: (result: any) => void) => Promise.resolve({ error: null }).then(resolve) };
    return query;
  } };
  requireUser.mockResolvedValue({ supabase, user: { id: "u" }, response: null });
});
describe("Meta campaign status route delivery evidence", () => {
  it.each([["PENDING_REVIEW", null, "review"], ["PREPARING", null, "preparing"], ["ACTIVE", 0, "preparing"], ["ACTIVE", 1, "active"], ["ACTIVE", null, "unknown"]])("maps fresh %s / %s impressions to %s", async (status, impressions, expected) => {
    getMetaAdReviewStatus.mockResolvedValue(snapshot(status as string, impressions as number | null));
    const result = await get(); expect(result.status).toBe(200); expect(result.body.status).toBe(expected);
    expect(result.body.status_verified).toBe(expected !== "unknown");
  });
  it("persists the edited-ad baseline and waits for a later impression", async () => {
    row.status = "active";
    getMetaAdReviewStatus.mockResolvedValue(snapshot("ACTIVE", 100, true));
    expect((await get()).body.status).toBe("preparing");
    expect(writes[0].meta_delivery_observation).toMatchObject({ baseline_impressions: 100, confirmed: false });
    expect((await get()).body.status).toBe("preparing");
    getMetaAdReviewStatus.mockResolvedValue(snapshot("ACTIVE", 101, true));
    expect((await get()).body.status).toBe("active");
    expect(row.meta_delivery_observation.confirmed).toBe(true);
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
