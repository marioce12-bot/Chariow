import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), pauseMeta: vi.fn(), report: vi.fn(), insightSelect: vi.fn(), syncError: null as string | null, attributionError: false, reportError: false }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "test-token" }));
vi.mock("@/lib/meta/campaigns", () => ({ pauseMetaCampaign: mocks.pauseMeta }));
vi.mock("@/lib/tiktok/campaigns", () => ({ pauseTikTokCampaign: vi.fn() }));
vi.mock("@/lib/autopilot-customer-value", () => ({ loadStoreCustomerValue: async () => ({ customerCount: null, customerValue: null, complete: false }) }));
vi.mock("@/lib/ai/autopilot-verdict", () => ({ refineAutopilotVerdictWithAI: async (_: unknown, decision: unknown) => decision }));
import { GET } from "@/app/api/cron/autopilot/route";
const campaign = { id: "c1", user_id: "u1", store_id: "s1", platform: "meta", status: "active", objective: "sales", effective_objective: "sales", daily_budget: 2, created_at: "2026-10-01T00:00:00Z", external_campaign_id: "m1", meta_ad_account_id: "a1" };
function builder(table: string) {
  let columns = "";
  const q: any = {};
  for (const method of ["eq", "in", "not", "gte", "lte", "order", "limit"]) q[method] = () => q;
  q.select = (value: string) => { columns = value; if (table === "meta_insights_daily") mocks.insightSelect(value); return q; };
  q.insert = (value: unknown) => { mocks.report(value); return Promise.resolve({ error: mocks.reportError ? { message: "write failed" } : null }); };
  const resolve = () => {
    if (table === "ad_campaigns") return { data: [campaign], error: null };
    if (table === "meta_ad_accounts") return { data: columns === "currency" ? { currency: "USD" } : { last_sync_error: mocks.syncError }, error: null };
    if (table === "meta_insights_daily") return { data: [{ date_start: "2026-10-17", spend: 5, impressions: 100, clicks: 4 }], error: null };
    if (table === "meta_attributions" && mocks.attributionError) return { data: null, error: { message: "read failed" } };
    return { data: [], error: null };
  };
  q.maybeSingle = async () => resolve();
  q.then = (ok: any, fail: any) => Promise.resolve(resolve()).then(ok, fail);
  return q;
}
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-17T20:00:00Z"));
  process.env.CRON_SECRET = "test-secret";
  mocks.syncError = null; mocks.attributionError = false; mocks.reportError = false;
  mocks.from.mockImplementation(builder);
});
const request = () => new Request("http://localhost/api/cron/autopilot", { headers: { authorization: "Bearer test-secret" } });
describe("autopilot cron safety", () => {
  it("rejects unauthenticated calls", async () => {
    expect((await GET(new Request("http://localhost/api/cron/autopilot"))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("selects insight dates and preserves sync health while summing rows", async () => {
    expect((await GET(request())).status).toBe(200);
    expect(mocks.insightSelect).toHaveBeenCalledWith("spend,impressions,clicks,date_start");
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ spend: 5, decision: "insufficient_data", metrics: expect.objectContaining({ insights_latest_date: "2026-10-17", insights_fresh: true, meta_sync_error: false }) }));
    expect(mocks.pauseMeta).not.toHaveBeenCalled();
  });
  it("records failed Meta synchronization as unreliable rather than fresh", async () => {
    mocks.syncError = "Meta sync failed";
    expect((await GET(request())).status).toBe(200);
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ decision: "insufficient_data", metrics: expect.objectContaining({ insights_fresh: false, meta_sync_error: true }) }));
    expect(mocks.pauseMeta).not.toHaveBeenCalled();
  });
  it("surfaces attribution read failures without inventing zero sales", async () => {
    mocks.attributionError = true;
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ failed: 1 });
    expect(mocks.report).not.toHaveBeenCalled(); expect(mocks.pauseMeta).not.toHaveBeenCalled();
  });
  it("surfaces report persistence failures and does not act", async () => {
    mocks.reportError = true;
    expect((await GET(request())).status).toBe(500);
    expect(mocks.pauseMeta).not.toHaveBeenCalled();
  });
});
