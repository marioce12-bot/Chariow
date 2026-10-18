import { beforeEach, describe, expect, it, vi } from "vitest";
const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: auth }));
import { GET } from "@/app/api/tracking-quality/route";
let rows: Record<string, any[]>;
let failures: Set<string>;
let called: string[];
function query(table: string) {
  called.push(table);
  const filters: Array<(r: any) => boolean> = [];
  const result = () => ({ data: failures.has(table) ? null : (rows[table] ?? []).filter(r => filters.every(f => f(r))), error: failures.has(table) ? { message: "unavailable" } : null });
  const q: any = {
    select: () => q, order: () => q, gte: () => q, lte: () => q,
    eq: (key: string, v: unknown) => { filters.push(r => r[key] === v); return q; },
    in: (key: string, v: unknown[]) => { filters.push(r => v.includes(r[key])); return q; },
    not: (key: string, _op: string, v: unknown) => { filters.push(r => r[key] !== v && r[key] != null); return q; },
    maybeSingle: async () => { const r = result(); return { ...r, data: r.data?.[0] ?? null }; },
    range: async (a: number, b: number) => { const r = result(); return { ...r, data: r.data?.slice(a, b + 1) ?? null }; },
    then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
  };
  return q;
}
async function diagnostic() {
  const response = await GET(new Request("https://example.invalid/api/tracking-quality?store_id=shop"));
  expect(response.status).toBe(200);
  return (await response.json()).quality;
}
beforeEach(() => {
  failures = new Set(); called = [];
  rows = {
    stores: [{ id: "shop", user_id: "owner", is_active: true, sales_last_sync_complete: true, sales_last_synced_at: new Date().toISOString() }],
    ad_campaigns: [{ id: "ad", user_id: "owner", store_id: "shop", meta_ad_account_id: "account" }],
    meta_ad_accounts: [{ id: "account", user_id: "owner", store_id: null, is_active: true }],
    meta_pixels: [{ user_id: "owner", ad_account_id: "account", configured_on_chariow: true, last_fired_at: null }],
    chariow_sales: [{ store_id: "shop", chariow_sale_id: "sale", product_id: "product", status: "paid", amount: 100, net_amount: 85, currency: "XOF" }],
    meta_campaign_mappings: [], meta_attributions: [],
  };
  auth.mockResolvedValue({ user: { id: "owner" }, supabase: { from: query } });
});
describe("tracking quality account/pixel scope", () => {
  it("recognizes a configured pixel through an explicit campaign without a direct account store_id", async () => {
    const q = await diagnostic();
    expect(q.issues.map((i: any) => i.code)).not.toContain("account_unlinked");
    expect(q.issues.map((i: any) => i.code)).not.toContain("pixel_unknown");
    expect(q.issues.map((i: any) => i.code)).toContain("attribution_missing");
    expect(q.status).toBe("incomplete");
    expect(q.automaticActionsAllowed).toBe(false);
  });
  it("preserves a legitimate direct account association even without a Vendeo-created campaign", async () => {
    rows.ad_campaigns = [];
    rows.meta_ad_accounts[0].store_id = "shop";
    const q = await diagnostic();
    expect(q.issues.map((i: any) => i.code)).not.toContain("account_unlinked");
    expect(q.issues.map((i: any) => i.code)).not.toContain("pixel_unknown");
  });
  it("rejects a campaign link to an account owned by someone else and does not inspect its pixels", async () => {
    rows.meta_ad_accounts[0].user_id = "other";
    const q = await diagnostic();
    expect(q.issues.map((i: any) => i.code)).toContain("account_unlinked");
    expect(q.issues.map((i: any) => i.code)).not.toContain("pixel_unknown");
    expect(called).not.toContain("meta_pixels");
  });
  it("treats a failed account lookup as unknown rather than telling the user their pixel is missing", async () => {
    failures.add("meta_ad_accounts");
    const q = await diagnostic();
    expect(q.issues.map((i: any) => i.code)).toContain("accounts_unknown");
    expect(q.issues.map((i: any) => i.code)).not.toContain("pixel_unknown");
  });
});
