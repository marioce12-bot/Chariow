import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), decryptSecret: vi.fn(() => "test-token"), pause: vi.fn(), activate: vi.fn(), del: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: mocks.decryptSecret }));
vi.mock("@/lib/meta/campaigns", () => ({ pauseMetaCampaign: mocks.pause, activateMetaCampaign: mocks.activate, deleteMetaCampaign: mocks.del }));
const request = (body: object) => new Request("http://localhost/api/chat/campaign-actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const copy = (data: any) => data == null ? data : structuredClone(data);
const draft = { id: "c1", user_id: "u1", status: "draft", platform: "meta", updated_at: "2026-01-01T00:00:00.000Z", title: "Guide IA", product_id: "p1", store_id: "s1", product_name: "Guide", objective: "sales", ad_text: "Texte", destination_url: "https://example.com/product?utm_campaign=source&x=1", media_url: "https://example.com/image.jpg", carousel_urls: ["https://example.com/second.jpg"], daily_budget: 5, duration_days: 3, countries: ["BJ"], min_age: 18, max_age: 65, call_to_action: "SHOP_NOW", advantage_audience: true, advantage_creative: false };
let rows: any[]; let account: any; let states: Record<string, any>; let operations: any[]; let revision: number; let dbFailure: string; let fetchMock: ReturnType<typeof vi.fn>;
function database() {
  return { from: (table: string) => {
    let op = "read"; let values: any; const filters: [string, unknown][] = [];
    const run = async () => {
      operations.push({ table, op, values: copy(values), filters: copy(filters) });
      if (dbFailure === op) return { data: null, error: { message: "simulated DB failure" } };
      const data = table === "ad_campaigns" ? rows : [account];
      if (op === "insert") { const inserted = { ...copy(values), id: `copy-${++revision}`, updated_at: `db-trigger-${revision}` }; rows.push(inserted); return { data: copy(inserted), error: null }; }
      const found = data.find(row => row && filters.every(([key, value]) => row[key] === value));
      if (!found) return { data: null, error: null };
      if (op === "delete") rows.splice(rows.indexOf(found), 1);
      if (op === "update") Object.assign(found, copy(values), { updated_at: `db-trigger-${++revision}` });
      return { data: copy(found), error: null };
    };
    const q: any = { select: () => q, eq: (key: string, value: unknown) => { filters.push([key, value]); return q; }, update: (v: unknown) => { op = "update"; values = v; return q; }, delete: () => { op = "delete"; return q; }, insert: (v: unknown) => { op = "insert"; values = v; return q; }, maybeSingle: run, single: run };
    return q;
  } };
}
function published() {
  Object.assign(rows[0], { status: "active", external_campaign_id: "meta-c", external_adset_id: "meta-s", external_ad_id: "meta-a", meta_ad_account_id: "acc", autopilot_enabled: true });
}
async function call(phase: string, action: string, extra: object = {}) { return POST(request({ phase, action, campaignId: "c1", ...extra })); }
async function prepared(action: string, extra: object = {}) { const res = await call("prepare", action, extra); expect(res.status).toBe(200); return (await res.json()).token as string; }
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("TOKEN_ENCRYPTION_KEY", "test-only");
  rows = [copy(draft)]; operations = []; revision = 0; dbFailure = "";
  account = { id: "acc", user_id: "u1", access_token_encrypted: "encrypted", is_active: true, meta_account_id: "act_123", currency: "USD" };
  states = { "meta-c": { id: "meta-c", name: "Campagne Meta", account_id: "123", status: "ACTIVE", effective_status: "ACTIVE" }, "meta-s": { id: "meta-s", name: "Ensemble", account_id: "123", campaign_id: "meta-c", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "500" }, "meta-a": { id: "meta-a", name: "Annonce", account_id: "123", campaign_id: "meta-c", adset_id: "meta-s", status: "ACTIVE", effective_status: "ACTIVE" } };
  mocks.decryptSecret.mockReturnValue("test-token");
  mocks.requireUser.mockResolvedValue({ user: { id: "u1" }, supabase: database(), response: null });
  mocks.pause.mockImplementation(async () => { for (const row of Object.values(states)) row.status = row.effective_status = "PAUSED"; });
  mocks.activate.mockImplementation(async () => { for (const row of Object.values(states)) row.status = row.effective_status = "ACTIVE"; });
  mocks.del.mockResolvedValue(undefined);
  fetchMock = vi.fn(async (url: string) => Response.json(copy(states[new URL(url).pathname.split("/").pop()!])));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Assistant campaign actions — no real DB or platform access", () => {
  it("requires auth and scopes all reads to the owner", async () => {
    mocks.requireUser.mockResolvedValueOnce({ user: null, supabase: null, response: Response.json({}, { status: 401 }) });
    expect((await call("prepare", "delete")).status).toBe(401);
    expect(operations).toHaveLength(0);
    rows[0].user_id = "other";
    expect((await call("prepare", "delete")).status).toBe(404);
    expect(operations[0].filters).toContainEqual(["user_id", "u1"]);
  });
  it("prepare never mutates and execute requires an explicit exact confirmation", async () => {
    const changes = { title: "Nouveau", daily_budget: 8 };
    const token = await prepared("edit", { changes });
    expect(operations.every(op => op.op === "read")).toBe(true);
    expect((await call("execute", "edit", { changes, token })).status).toBe(400);
    expect((await call("execute", "edit", { changes: { ...changes, daily_budget: 99 }, token, confirmed: true })).status).toBe(409);
    expect((await call("execute", "edit", { changes, token, confirmed: true })).status).toBe(200);
    expect(rows[0].daily_budget).toBe(8); expect(rows[0].estimated_budget).toBe(24);
    expect((await call("execute", "edit", { changes, token, confirmed: true })).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(["meta", "pinterest", "tiktok"])("duplicates a %s local draft independently and rejects replay", async platform => {
    rows[0].platform = platform;
    const token = await prepared("duplicate");
    const results = await Promise.all([call("execute", "duplicate", { token, confirmed: true }), call("execute", "duplicate", { token, confirmed: true })]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ status: "draft", platform, autopilot_enabled: false, call_to_action: "SHOP_NOW", carousel_urls: draft.carousel_urls });
    expect(rows[1].external_campaign_id).toBeUndefined(); expect(rows[1].external_ad_id).toBeUndefined();
    expect(rows[1].destination_url).not.toContain("utm_campaign");
    expect(fetchMock).not.toHaveBeenCalled(); expect(mocks.activate).not.toHaveBeenCalled();
  });
  it("deletes only the confirmed owned local draft", async () => {
    const token = await prepared("delete");
    expect((await call("execute", "delete", { token, confirmed: true })).status).toBe(200);
    expect(rows).toHaveLength(0); expect(mocks.del).not.toHaveBeenCalled();
  });
  it.each(["pinterest", "tiktok"])("honestly rejects external %s mutations", async platform => {
    published(); rows[0].platform = platform;
    expect((await call("prepare", "pause")).status).toBe(501);
    expect(operations.some(op => op.op !== "read")).toBe(false); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([{ error: { message: "bad" } }, { id: "wrong", status: "ACTIVE" }, { id: "meta-c", account_id: "other", status: "ACTIVE" }, { id: "meta-c", account_id: "123", status: "MADE_UP" }])("rejects unverifiable Graph data %j", async invalid => {
    published(); states["meta-c"] = invalid;
    expect((await call("prepare", "pause")).status).toBe(503);
    expect(mocks.pause).not.toHaveBeenCalled();
  });
  it("rejects a mismatched ad hierarchy and missing child IDs before preparation", async () => {
    published(); states["meta-a"].campaign_id = "foreign";
    expect((await call("prepare", "activate")).status).toBe(503);
    delete rows[0].external_ad_id;
    expect((await call("prepare", "activate")).status).toBe(409);
  });
  it("rereads Meta at execution and rejects changed state/parameters", async () => {
    published(); const token = await prepared("pause");
    states["meta-s"].daily_budget = "9000";
    expect((await call("execute", "pause", { token, confirmed: true })).status).toBe(409);
    expect(mocks.pause).not.toHaveBeenCalled();
  });
  it.each(["pause", "activate"])("executes exact confirmed Meta %s once, verifies state, uses DB trigger timestamp", async action => {
    published();
    const token = await prepared(action);
    expect(mocks.pause).not.toHaveBeenCalled(); expect(mocks.activate).not.toHaveBeenCalled();
    const res = await call("execute", action, { token, confirmed: true });
    expect(res.status).toBe(200);
    const helper = action === "pause" ? mocks.pause : mocks.activate;
    expect(helper).toHaveBeenCalledTimes(1); expect(helper).toHaveBeenCalledWith({ campaignId: "meta-c", adSetId: "meta-s", adId: "meta-a", accessToken: "test-token" });
    expect(rows[0].autopilot_enabled).toBe(false); expect(rows[0].status).toBe(action === "pause" ? "paused" : "review");
    expect(fetchMock.mock.calls.length).toBe(9);
    expect((await call("execute", action, { token, confirmed: true })).status).toBe(409);
    expect(helper).toHaveBeenCalledTimes(1);
  });
  it("does not claim success on a partial Meta failure or unverified post-write state", async () => {
    published(); let token = await prepared("pause");
    mocks.pause.mockRejectedValueOnce(new Error("partial"));
    let res = await call("execute", "pause", { token, confirmed: true });
    expect(res.status).toBe(502); expect((await res.json()).error).toContain("partiellement");
    expect(rows[0].status).toBe("active"); expect(rows[0].autopilot_enabled).toBe(false);
    token = await prepared("pause"); mocks.pause.mockResolvedValueOnce(undefined);
    res = await call("execute", "pause", { token, confirmed: true });
    expect(res.status).toBe(502); expect((await res.json()).message).toBeUndefined();
  });
  it("claims deletion before Meta and preserves a deleted history row", async () => {
    published(); const token = await prepared("delete");
    expect((await call("execute", "delete", { token, confirmed: true })).status).toBe(200);
    expect(mocks.del).toHaveBeenCalledTimes(1); expect(mocks.del).toHaveBeenCalledWith({ campaignId: "meta-c", accessToken: "test-token" });
    expect(rows[0].status).toBe("deleted"); expect(rows[0].autopilot_enabled).toBe(false);
  });
  it("makes a published Meta copy only locally, without toggling source Autopilot", async () => {
    published(); const token = await prepared("duplicate");
    expect((await call("execute", "duplicate", { token, confirmed: true })).status).toBe(200);
    expect(rows[0].autopilot_enabled).toBe(true); expect(rows[1].autopilot_enabled).toBe(false);
    expect(rows[1].external_campaign_id).toBeUndefined(); expect(mocks.activate).not.toHaveBeenCalled();
  });
  it("stops on a failed claim or insert, and never sends a Meta mutation", async () => {
    published(); let token = await prepared("pause"); dbFailure = "update";
    expect((await call("execute", "pause", { token, confirmed: true })).status).toBe(500); expect(mocks.pause).not.toHaveBeenCalled();
    dbFailure = ""; token = await prepared("duplicate"); dbFailure = "insert";
    expect((await call("execute", "duplicate", { token, confirmed: true })).status).toBe(500); expect(rows).toHaveLength(1);
  });
  it("rejects activating archived/deleted Meta objects, and editing published campaigns", async () => {
    published(); states["meta-c"].status = states["meta-c"].effective_status = "DELETED";
    expect((await call("prepare", "activate")).status).toBe(409);
    states["meta-c"].status = states["meta-c"].effective_status = "ACTIVE";
    expect((await call("prepare", "edit", { changes: { title: "New" } })).status).toBe(501);
  });
  it("cannot bypass the existing launch/payment flow for a pending campaign", async () => {
    published(); rows[0].status = "pending_payment";
    expect((await call("prepare", "activate")).status).toBe(409);
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
