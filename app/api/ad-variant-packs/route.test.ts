import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), createAdminClient: vi.fn(), db: null as any }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
import { POST } from "./route";
const input = {
  client_request_id: "request-1", store_id: "11111111-1111-4111-8111-111111111111", product_id: "p1", product_name: "Product",
  destination_url: "https://example.com", meta_ad_account_id: "22222222-2222-4222-8222-222222222222", meta_page_id: "page1", dsa_beneficiary: "Beneficiary Approved", dsa_payor: "Payor Approved",
  countries: ["US"], geo_targeting: {}, meta_targeting: {}, advantage_audience: false, min_age: 18, max_age: 65,
  daily_budget: 3, duration_days: 1, variants: ["a", "b", "c"].map((id) => ({ id, angle: id, format: "image", text: id, media: ["https://example.com/a.jpg"], call_to_action: "SHOP_NOW" })),
};
function req(payload: unknown = input) { return new Request("http://local/api/ad-variant-packs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }
function client(isAdmin: boolean) {
  return { from(table: string) {
    let operation = "select"; let values: any; const filters: Array<[string, unknown]> = [];
    const q: any = {
      select: () => q, insert: (v: unknown) => { operation = "insert"; values = v; return q; },
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q; }, order: () => q, limit: () => q,
      maybeSingle: async () => run(), then: (resolve: any, reject: any) => run().then(resolve, reject),
    };
    const run = async () => {
      mocks.db.calls.push({ isAdmin, table, operation, values, filters: [...filters] });
      if (table === "stores") return { data: mocks.db.storeOwned ? { id: input.store_id } : null, error: mocks.db.storeError };
      if (table === "meta_ad_accounts") return { data: mocks.db.accountOwned ? { id: input.meta_ad_account_id } : null, error: null };
      if (table !== "ad_variant_packs") return { data: null, error: null };
      if (!isAdmin && operation !== "select") throw new Error("client write forbidden");
      const reqFilter = filters.some(([k, v]) => k === "client_request_id" && v === input.client_request_id);
      const ownerFilter = filters.some(([k, v]) => k === "user_id" && v === "user-1");
      if (operation === "select") return { data: reqFilter && ownerFilter ? mocks.db.existing : null, error: mocks.db.lookupError };
      if (operation === "insert") {
        mocks.db.insertValues = values;
        if (mocks.db.insertError) return { data: null, error: mocks.db.insertError };
        mocks.db.existing = { ...values, id: "pack-1" };
        return { data: mocks.db.existing, error: null };
      }
      return { data: null, error: null };
    };
    return q;
  } };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db = { calls: [], storeOwned: true, accountOwned: true, storeError: null, lookupError: null, insertError: null, existing: null, insertValues: null };
  mocks.requireUser.mockResolvedValue({ user: { id: "user-1" }, supabase: client(false), response: null });
  mocks.createAdminClient.mockImplementation(() => client(true));
});
describe("POST /api/ad-variant-packs", () => {
  it("requires store and ad-account ownership before any privileged write", async () => {
    mocks.db.storeOwned = false;
    expect((await POST(req())).status).toBe(403);
    expect(mocks.db.calls.some((x: any) => x.operation === "insert")).toBe(false);
    mocks.db.storeOwned = true; mocks.db.accountOwned = false;
    expect((await POST(req())).status).toBe(403);
    expect(mocks.db.calls.some((x: any) => x.operation === "insert")).toBe(false);
  });
  it("rejects missing, blank and overlong DSA names before insertion", async () => {
    for (const field of ["dsa_beneficiary", "dsa_payor"]) {
      for (const value of ["", "  ", "x".repeat(201)]) {
        expect((await POST(req({ ...input, [field]: value }))).status).toBe(400);
      }
    }
    expect(mocks.db.calls.some((x: any) => x.operation === "insert")).toBe(false);
  });
  it("creates only using service role after owner checks, with explicit user_id", async () => {
    const response = await POST(req());
    expect(response.status).toBe(201);
    expect(mocks.db.insertValues.user_id).toBe("user-1");
    expect(mocks.db.insertValues.dsa_beneficiary).toBe(input.dsa_beneficiary); expect(mocks.db.insertValues.dsa_payor).toBe(input.dsa_payor);
    expect(mocks.db.calls.filter((x: any) => x.table === "ad_variant_packs").every((x: any) => x.isAdmin)).toBe(true);
    expect(mocks.db.calls.find((x: any) => x.operation === "insert").isAdmin).toBe(true);
  });
  it("ignores caller-supplied operational fields", async () => {
    const response = await POST(req({ ...input, status: "completed", claim_token: "fake", checkpoints: { activated: true }, external_campaign_id: "other", user_id: "other", id: "injected" }));
    expect(response.status).toBe(201);
    expect(mocks.db.insertValues).toMatchObject({ user_id: "user-1", status: "draft", objective: "sales" });
    expect(mocks.db.insertValues.claim_token).toBeUndefined();
    expect(mocks.db.insertValues.checkpoints).toBeUndefined();
    expect(mocks.db.insertValues.external_campaign_id).toBeUndefined();
    expect(mocks.db.insertValues.id).toBeUndefined();
  });
  it("blocks preview before authentication or any database write", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    try {
      expect((await POST(req())).status).toBe(403);
      expect(mocks.requireUser).not.toHaveBeenCalled();
      expect(mocks.db.calls).toHaveLength(0);
    } finally { vi.unstubAllEnvs(); }
  });
  it("surfaces database lookup errors and never falls through to insert", async () => {
    mocks.db.lookupError = { message: "offline" };
    expect((await POST(req())).status).toBe(503);
    expect(mocks.db.calls.some((x: any) => x.operation === "insert")).toBe(false);
    mocks.db.lookupError = null; mocks.db.storeError = { message: "offline" };
    expect((await POST(req())).status).toBe(503);
  });
  it("returns the same row for an equal retry and rejects differing content", async () => {
    mocks.db.existing = { ...input, user_id: "user-1", id: "prior" };
    expect((await POST(req())).status).toBe(200);
    expect(mocks.db.calls.some((x: any) => x.operation === "insert")).toBe(false);
    expect((await POST(req({ ...input, product_name: "Changed" }))).status).toBe(409);
    expect(mocks.db.calls.some((x: any) => x.operation === "insert")).toBe(false);
  });
  it("contains no client insert/update/delete privileges in its mocked access path", async () => {
    await POST(req());
    const clientPackCalls = mocks.db.calls.filter((x: any) => x.table === "ad_variant_packs" && !x.isAdmin);
    expect(clientPackCalls).toHaveLength(0);
  });
});
