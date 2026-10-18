import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
  reports: [] as any[],
  campaigns: [] as any[],
  metaAccounts: [] as any[],
  tiktokAccounts: [] as any[],
  failures: {} as Record<string, boolean>,
  queries: [] as any[],
}));

vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
import { GET } from "@/app/api/autopilot/reports/route";

const report = (id: string, campaign_id: string, metrics: any = {}) => ({
  id, campaign_id, platform: "meta", period_from: "2025-01-01", period_to: "2025-01-07",
  spend: 10, gross_revenue: 30, net_revenue: 25, completed_sales: 2, impressions: 100,
  clicks: 5, roas: 3, cac: 5, decision: "keep_running", reasons: [], metrics,
  currency: "USD", created_at: `2025-01-${id === "r1" ? "02" : "01"}T00:00:00Z`,
});
const campaign = (id: string, platform: "meta" | "tiktok", extra: any = {}) => ({
  id, title: `Campagne ${id}`, product_name: null, platform, autopilot_enabled: true,
  autopilot_budget_limit: 50, autopilot_budget_limit_currency: "USD",
  meta_ad_account_id: platform === "meta" ? "ma1" : null,
  tiktok_ad_account_id: platform === "tiktok" ? "ta1" : null, created_at: "2025-01-01", ...extra,
});

function makeQuery(table: string) {
  const call: any = { table, eq: [], in: [], orders: [], limits: [], selects: [] };
  mocks.queries.push(call);
  const q: any = {};
  q.select = (value: string) => { call.selects.push(value); return q; };
  q.eq = (column: string, value: any) => { call.eq.push([column, value]); return q; };
  q.in = (column: string, value: any) => { call.in.push([column, value]); return q; };
  q.order = (column: string, options: any) => { call.orders.push([column, options]); return q; };
  q.limit = (value: number) => { call.limits.push(value); return q; };
  q.then = (resolve: any, reject: any) => Promise.resolve({
    data: table === "ad_campaign_autopilot_reports" ? mocks.reports
      : table === "ad_campaigns" ? mocks.campaigns
        : table === "meta_ad_accounts" ? mocks.metaAccounts : mocks.tiktokAccounts,
    error: mocks.failures[table] ? { message: "fake read failure" } : null,
  }).then(resolve, reject);
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reports = [report("r1", "c1", { recommendation: "keep", recommendation_reason: "historical", cpa_threshold: 7, mutation_block_reason: "HISTORICAL_BLOCK" }), report("r2", "c2")];
  mocks.campaigns = [
    campaign("c1", "meta"),
    campaign("c2", "tiktok", { autopilot_enabled: false, autopilot_budget_limit: 40 }),
    campaign("c3", "meta", { meta_ad_account_id: "ma2", autopilot_budget_limit_currency: "EUR" }),
  ];
  mocks.metaAccounts = [{ id: "ma1", currency: "USD" }, { id: "ma2", currency: "USD" }];
  mocks.tiktokAccounts = [{ id: "ta1", currency: "USD" }];
  mocks.failures = {};
  mocks.queries = [];
  mocks.requireUser.mockResolvedValue({ user: { id: "user-1" }, response: null, supabase: { from: mocks.from } });
  mocks.from.mockImplementation((table: string) => makeQuery(table));
});

const rows = (table: string) => mocks.queries.filter((query: any) => query.table === table);

describe("GET /api/autopilot/reports budget enrichment", () => {
  it("returns auth response without touching Supabase when unauthenticated", async () => {
    const response = Response.json({ error: "Unauthorized" }, { status: 401 });
    mocks.requireUser.mockResolvedValue({ user: null, response });
    expect(await GET()).toBe(response);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("scopes every read to the user; lists both platforms including disabled campaigns and exposes only current valid caps", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.queries.every((query: any) => query.eq.some(([column, value]: any[]) => column === "user_id" && value === "user-1"))).toBe(true);
    expect(rows("ad_campaigns")[0].in).toContainEqual(["platform", ["meta", "tiktok"]]);
    expect(body.campaigns).toHaveLength(3);
    expect(body.campaigns.find((item: any) => item.id === "c2")).toMatchObject({ autopilot_enabled: false, budget_limit: 40, currency: "USD" });
    expect(body.campaigns.find((item: any) => item.id === "c3")).toMatchObject({ budget_limit: null, currency: "USD" });
    expect(body.reports[0]).toMatchObject({ budget_limit: 50, budget_limit_currency: "USD", budget_block_reason: null, campaign_title: "Campagne c1" });
    expect(body.reports[1]).toMatchObject({ budget_limit: 40, budget_limit_currency: "USD", budget_block_reason: null });
    expect(body.reports[0]).toMatchObject({ recommendation: "keep", recommendation_reason: "historical", cpa_threshold: 7, mutation_block_reason: "HISTORICAL_BLOCK" });
    expect(body.reports[0].budget_block_reason).not.toBe(body.reports[0].mutation_block_reason);
    expect(rows("meta_ad_accounts")).toHaveLength(1);
    expect(rows("tiktok_ad_accounts")).toHaveLength(1);
    expect(rows("meta_ad_accounts")[0].in).toContainEqual(["id", ["ma1", "ma2"]]);
    expect(rows("tiktok_ad_accounts")[0].in).toContainEqual(["id", ["ta1"]]);
    for (const query of [...rows("ad_campaign_autopilot_reports"), ...rows("ad_campaigns")]) {
      expect(query.limits).toContain(100);
      expect(query.orders).toContainEqual(["created_at", { ascending: false }]);
    }
    expect(rows("meta_ad_accounts")[0].limits).toContain(100);
    expect(rows("tiktok_ad_accounts")[0].limits).toContain(100);
  });

  it.each(["ad_campaign_autopilot_reports", "ad_campaigns"])("returns 500 if the %s read fails", async (table) => {
    mocks.failures[table] = true;
    const response = await GET();
    expect(response.status).toBe(500);
  });
});
