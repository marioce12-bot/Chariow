import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: null as any, requireUser: vi.fn(), createAdminClient: vi.fn(), createPackMetaOperations: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/ad-variant-pack-meta", () => ({ createPackMetaOperations: mocks.createPackMetaOperations }));
import { POST } from "./route";

const id = "33333333-3333-4333-8333-333333333333";
const userId = "44444444-4444-4444-8444-444444444444";
const initial = {
  id, user_id: userId, status: "draft", client_request_id: "r1", store_id: "11111111-1111-4111-8111-111111111111",
  product_id: "product", product_name: "Produit", destination_url: "https://example.com/product", meta_ad_account_id: "22222222-2222-4222-8222-222222222222", meta_page_id: "page-1", dsa_beneficiary: "Bénéficiaire approuvé", dsa_payor: "Payeur approuvé",
  countries: ["BJ"], geo_targeting: {}, meta_targeting: {}, advantage_audience: false, min_age: 18, max_age: 65, daily_budget: 7, duration_days: 2,
  variants: ["a", "b", "c"].map((v) => ({ id: v, angle: v, format: "image", text: v, media: ["https://example.com/a.jpg"], call_to_action: "SHOP_NOW" })),
  checkpoints: {}, claim_token: null,
};
function client(isAdmin: boolean) {
  return {
    from(_table: string) {
      let action = "select", patch: Record<string, unknown> = {}; const filters: Array<[string, unknown]> = [];
      const q: any = {
        select: () => q,
        update: (value: Record<string, unknown>) => { if (!isAdmin) throw new Error("user write forbidden"); action = "update"; patch = value; return q; },
        eq: (key: string, value: unknown) => { filters.push([key, value]); return q; },
        maybeSingle: async () => run(true), single: async () => run(true),
        then: (resolve: (x: unknown) => void, reject: (e: unknown) => void) => run(false).then(resolve, reject),
      };
      const run = async (single: boolean) => {
        const row = mocks.db.pack;
        if (!filters.every(([key, value]) => row[key] === value)) return { data: single ? null : [], error: null };
        if (action === "update") {
          mocks.db.saves++;
          if (mocks.db.failSaveAt === mocks.db.saves) return { data: null, error: { message: "simulated database failure" } };
          Object.assign(row, structuredClone(patch));
          return { data: single ? structuredClone(row) : [{ id: row.id }], error: null };
        }
        return { data: single ? structuredClone(row) : [structuredClone(row)], error: null };
      };
      return q;
    },
    async rpc(name: string, args: any) {
      if (!isAdmin || name !== "claim_ad_variant_pack") throw new Error("unexpected RPC");
      if (mocks.db.pack.status !== "draft" || args.p_user_id !== userId || args.p_id !== id) return { data: false, error: null };
      mocks.db.pack.status = "claimed"; mocks.db.pack.claim_token = args.p_claim_token;
      return { data: true, error: null };
    },
  };
}
function req() { return new Request(`http://local/api/ad-variant-packs/${id}/launch`, { method: "POST" }); }
function ctx() { return { params: Promise.resolve({ id }) }; }
beforeEach(() => {
  vi.resetAllMocks();
  mocks.db = { pack: structuredClone(initial), saves: 0, failSaveAt: -1, calls: [] };
  mocks.requireUser.mockResolvedValue({ user: { id: userId }, supabase: client(false), response: null });
  mocks.createAdminClient.mockImplementation(() => client(true));
  mocks.createPackMetaOperations.mockImplementation(() => ({
    verify: async () => ({ store: true, account: true, page: true, media: true, pixelCheck: "none", exhaustivePixelList: true }),
    createCampaign: async (x: any) => { mocks.db.calls.push(["campaign", x]); return "meta-campaign"; },
    createAdSet: async (x: any) => { mocks.db.calls.push(["adset", x]); return `set-${mocks.db.calls.filter((a: any) => a[0] === "adset").length}`; },
    createCreative: async (x: any) => { mocks.db.calls.push(["creative", x]); return `creative-${mocks.db.calls.filter((a: any) => a[0] === "creative").length}`; },
    createAd: async (x: any) => { mocks.db.calls.push(["ad", x]); return `ad-${mocks.db.calls.filter((a: any) => a[0] === "ad").length}`; },
    activateParent: async (x: any) => { mocks.db.calls.push(["activate", x]); },
  }));
});

describe("Pack launch endpoint — simulated only", () => {
  it("atomically accepts one launch with one full-budget ad set and three ads", async () => {
    const responses = await Promise.all([POST(req(), ctx()), POST(req(), ctx())]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(mocks.db.calls.filter((x: any) => x[0] === "campaign")).toHaveLength(1);
    const sets = mocks.db.calls.filter((x: any) => x[0] === "adset");
    expect(sets).toHaveLength(1);
    expect(sets[0][1]).toMatchObject({ campaignId: "meta-campaign", budgetCents: 700 });
    const ads = mocks.db.calls.filter((x: any) => x[0] === "ad");
    expect(ads).toHaveLength(3);
    expect(ads.map((x: any) => x[1].adsetId)).toEqual(["set-1", "set-1", "set-1"]);
    expect(ads.map((x: any) => x[1].variant.angle)).toEqual(["a", "b", "c"]);
    expect(mocks.db.pack.status).toBe("completed");
    expect(mocks.db.pack.checkpoints.activated).toBe(true);
    expect(mocks.db.pack.checkpoints.adsets).toEqual(["set-1"]);
    expect(mocks.db.pack.checkpoints.ads).toEqual(["ad-1", "ad-2", "ad-3"]);
    expect(mocks.db.calls.at(-1)).toEqual(["activate", "meta-campaign"]);
  });
  it("does not repeat an external creation when the subsequent checkpoint fails", async () => {
    mocks.db.failSaveAt = 3;
    expect((await POST(req(), ctx())).status).toBe(503);
    expect(mocks.db.pack.status).toBe("ambiguous");
    expect((await POST(req(), ctx())).status).toBe(409);
    expect(mocks.db.calls.filter((x: any) => x[0] === "campaign")).toHaveLength(1);
    expect(mocks.db.calls.filter((x: any) => x[0] === "activate")).toHaveLength(0);
  });
  it("blocks preview before authentication and external calls", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    try {
      expect((await POST(req(), ctx())).status).toBe(403);
      expect(mocks.requireUser).not.toHaveBeenCalled();
      expect(mocks.db.calls).toHaveLength(0);
    } finally { vi.unstubAllEnvs(); }
  });
});
