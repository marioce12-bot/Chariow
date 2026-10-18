import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn(), datasets: {} as Record<string, any[]> }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
import { GET } from "@/app/api/campaign-profit/route";

function query(table: string) {
  const filters: Array<[string, any]> = [];
  const q: any = {
    select: vi.fn(() => q), eq: vi.fn((key, value) => { filters.push([key, value]); return q; }),
    in: vi.fn((key, value) => { filters.push([`${key}:in`, value]); return q; }),
    not: vi.fn(() => q), gte: vi.fn(() => q), lte: vi.fn(() => q), order: vi.fn(() => q), range: vi.fn(() => q),
    single: vi.fn(async () => ({ data: { id: "store", sales_last_synced_at: null, sales_last_sync_complete: false }, error: null })),
    then(resolve: (value: any) => any, reject: (reason: any) => any) {
      let rows = mocks.datasets[table] ?? [];
      for (const [key, value] of filters) {
        if (key.endsWith(":in")) rows = rows.filter((r: any) => value.includes(r[key.slice(0, -3)]));
        else rows = rows.filter((r: any) => r[key] === value);
      }
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    },
  };
  return q;
}
const request = () => new Request("http://localhost/api/campaign-profit?storeId=store&period=7");
const account = { id: "account", currency: "USD", is_active: true, user_id: "owner", insights_sync_complete: false };
function setup({ links = [], accounts = [account], campaigns = [], insights = [] }: any = {}) {
  mocks.datasets = {
    stores: [], ad_campaigns: links, meta_ad_accounts: accounts,
    meta_campaigns: campaigns, meta_insights_daily: insights,
    meta_campaign_mappings: [], meta_attributions: [], chariow_sales: [], product_profit_costs: [],
  };
  mocks.from.mockImplementation((table: string) => query(table));
  mocks.requireUser.mockResolvedValue({ user: { id: "owner" }, supabase: { from: mocks.from } });
}
describe("campaign profit account scoping", () => {
  beforeEach(() => { vi.clearAllMocks(); setup(); });
  it("recognizes an active indirect account but returns only explicitly linked external campaigns", async () => {
    setup({
      links: Array.from({ length: 5 }, (_, i) => ({ meta_ad_account_id: "account", external_campaign_id: `owned-${i}`, platform: "meta", store_id: "store", user_id: "owner" })),
      campaigns: [{ ad_account_id: "account", meta_campaign_id: "owned-0", name: "Owned" }, { ad_account_id: "account", meta_campaign_id: "other-store", name: "Other" }],
      insights: [{ ad_account_id: "account", entity_id: "owned-0", level: "campaign", entity_name: "Owned", date_start: "2025-01-01", date_stop: "2025-01-01", spend: 5 }, { ad_account_id: "account", entity_id: "other-store", level: "campaign", entity_name: "Other", date_start: "2025-01-01", date_stop: "2025-01-01", spend: 99 }],
    });
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.campaigns.map((c: any) => c.id)).toEqual(["owned-0"]);
  });
  it("returns the honest non-identification message when the store has no campaign link", async () => {
    setup({ accounts: [] });
    const body = await (await GET(request())).json();
    expect(body.campaigns).toEqual([]);
    expect(body.reasons[0]).toContain("Compte publicitaire de cette boutique non identifié dans Vendeo");
    expect(body.reasons[0]).toContain("ton pixel est absent");
    expect(body.reasons[0]).not.toContain("Rattacher");
  });
  it("rejects an account owned by another user despite a campaign link", async () => {
    setup({
      links: [{ meta_ad_account_id: "foreign", external_campaign_id: "foreign-campaign", platform: "meta", store_id: "store", user_id: "owner" }],
      accounts: [{ ...account, id: "foreign", user_id: "someone-else" }],
      campaigns: [{ ad_account_id: "foreign", meta_campaign_id: "foreign-campaign", name: "Foreign" }],
      insights: [{ ad_account_id: "foreign", entity_id: "foreign-campaign", level: "campaign", date_start: "2025-01-01", date_stop: "2025-01-01", spend: 99 }],
    });
    const body = await (await GET(request())).json();
    expect(body.campaigns).toEqual([]);
    expect(body.reasons[0]).toContain("Compte publicitaire de cette boutique non identifié");
  });
});
