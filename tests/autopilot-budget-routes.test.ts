import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
  campaign: null as any,
  account: null as any,
  update: vi.fn(),
  updateError: false,
  absentCurrency: false,
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
import { GET, PATCH } from "@/app/api/ad-campaigns/[id]/autopilot/budget-limit/route";
import { POST } from "@/app/api/ad-campaigns/[id]/autopilot/route";

const context = { params: Promise.resolve({ id: "c1" }) };
const campaignDefault = () => ({
  id: "c1", platform: "meta", meta_ad_account_id: "a1", tiktok_ad_account_id: null,
  autopilot_enabled: false, autopilot_budget_limit: null, autopilot_budget_limit_currency: null,
});
function query(table: string) {
  let selected = "";
  let updateBody: any = null;
  const q: any = {};
  q.select = (columns: string) => { selected = columns; return q; };
  q.eq = () => q;
  q.maybeSingle = async () => ({
    data: table === "ad_campaigns" ? mocks.campaign : table === "meta_ad_accounts" ? (mocks.absentCurrency ? null : mocks.account) : null,
    error: null,
  });
  q.update = (value: any) => { updateBody = value; mocks.update(value); return q; };
  q.single = async () => ({ data: { ...mocks.campaign, ...updateBody }, error: mocks.updateError ? { message: "write failed" } : null });
  q.then = (resolve: any, reject: any) => Promise.resolve({
    data: table === "ad_campaigns" ? mocks.campaign : table === "meta_ad_accounts" ? (mocks.absentCurrency ? null : mocks.account) : null,
    error: null,
  }).then(resolve, reject);
  return q;
}
function req(body?: unknown) {
  return new Request("http://localhost/api/test", { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const ctx = () => ({ params: Promise.resolve({ id: "c1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.campaign = campaignDefault(); mocks.account = { currency: "USD" };
  mocks.updateError = false; mocks.absentCurrency = false;
  mocks.requireUser.mockResolvedValue({ user: { id: "u1" }, response: null, supabase: { from: mocks.from } });
  mocks.from.mockImplementation((table: string) => query(table));
});

describe("autopilot budget routes", () => {
  it("rejects unauthenticated GET/PATCH/POST without database access", async () => {
    mocks.requireUser.mockResolvedValue({ user: null, response: Response.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await GET(req(), ctx())).status).toBe(401);
    expect((await PATCH(req({ budget_limit: 10, currency: "USD" }), ctx())).status).toBe(401);
    expect((await POST(req({ enabled: false }), ctx())).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("does not write for a foreign campaign id", async () => {
    mocks.campaign = null;
    expect((await PATCH(req({ budget_limit: 10, currency: "USD" }), ctx())).status).toBe(404);
    expect((await POST(req({ enabled: false }), ctx())).status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("allows disabling without a cap and only changes enabled flag", async () => {
    const response = await POST(req({ enabled: false }), ctx());
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ autopilot_enabled: false });
  });

  it.each([{ enabled: true }, { enabled: true, budget_limit: 0, currency: "USD" }, { enabled: true, budget_limit: -1, currency: "USD" }, { enabled: true, budget_limit: "10", currency: "USD" }, { enabled: true, budget_limit: 10, currency: "EUR" }])("rejects invalid enable payload $budget_limit/$currency without writing", async (body) => {
    expect((await POST(req(body), ctx())).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("enables with one atomic enabled/cap/currency update", async () => {
    const response = await POST(req({ enabled: true, budget_limit: 12.5, currency: "usd" }), ctx());
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({ autopilot_enabled: true, autopilot_budget_limit: 12.5, autopilot_budget_limit_currency: "USD" });
  });

  it("refuses PATCH while disabled", async () => {
    expect((await PATCH(req({ budget_limit: 20, currency: "USD" }), ctx())).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("PATCH persists cap with authoritative currency", async () => {
    mocks.campaign.autopilot_enabled = true;
    const response = await PATCH(req({ budget_limit: 20, currency: "usd" }), ctx());
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ autopilot_budget_limit: 20, autopilot_budget_limit_currency: "USD" });
  });

  it("GET hides a stored cap with stale currency", async () => {
    mocks.campaign.autopilot_budget_limit = 25; mocks.campaign.autopilot_budget_limit_currency = "EUR";
    const response = await GET(req(), ctx());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ budget_limit: null, currency: "USD" });
  });

  it("refuses operations with explanatory error when account currency is absent", async () => {
    mocks.absentCurrency = true;
    const response = await GET(req(), ctx());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "CURRENCY_UNAVAILABLE" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not silently enable a saved cap without an explicit cap", async () => {
    mocks.campaign.autopilot_budget_limit = 30; mocks.campaign.autopilot_budget_limit_currency = "USD";
    expect((await POST(req({ enabled: true }), ctx())).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("reports persistence failure as server error, not success", async () => {
    mocks.updateError = true;
    const response = await POST(req({ enabled: false }), ctx());
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "SAVE_FAILED" });
  });
});
