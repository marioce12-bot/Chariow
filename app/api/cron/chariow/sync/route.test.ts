import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ notify: vi.fn(), snapshot: vi.fn(), store: { id: "s1", user_id: "u1", store_name: "Boutique", connected_at: "2026-10-01T00:00:00Z" }, upserts: [] as unknown[] }));
vi.mock("@/lib/chariow/sale-notifications", () => ({ notifyChariowSales: m.notify }));
vi.mock("@/lib/chariow/analytics", () => ({ getChariowSnapshot: m.snapshot }));
vi.mock("@/lib/attribution/auto-map", () => ({ autoMapChariowCampaigns: vi.fn(async () => 0) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({
  select: () => { const q = { eq: () => q, then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: [m.store], error: null }).then(resolve) }; return q; },
  upsert: async (rows: unknown) => { m.upserts.push(rows); return { error: null }; },
  update: () => ({ eq: async () => ({ error: null }) }),
}) }) }));
import { GET, POST } from "./route";
const sales = { data: [{ id: "sale1", status: "paid", amount: 1200, currency: "XOF", created_at: "2026-10-22T00:00:00Z" }] };
beforeEach(() => { vi.clearAllMocks(); m.upserts = []; m.notify.mockResolvedValue(undefined); m.snapshot.mockResolvedValue({ sales, coverage: { sales: { complete: true } } }); vi.stubEnv("CRON_SECRET", "test-cron"); });
describe("background Chariow sale notifications", () => {
  it("rejects unauthorized calls without reading sales", async () => {
    expect((await POST(new Request("https://test/api/cron/chariow/sync"))).status).toBe(401);
    expect(m.snapshot).not.toHaveBeenCalled(); expect(m.notify).not.toHaveBeenCalled();
  });
  it("passes the complete wrapped sales collection and trusted store to notifications", async () => {
    const response = await GET(new Request("https://test/api/cron/chariow/sync", { headers: { authorization: "Bearer test-cron" } }));
    expect(response.status).toBe(200); expect(m.upserts).toHaveLength(1);
    expect(m.notify).toHaveBeenCalledWith(m.store, sales);
    expect((await response.json()).synced[0].sales_synced).toBe(1);
  });
  it("preserves sales synchronization if notification delivery fails", async () => {
    m.notify.mockRejectedValue(new Error("push unavailable"));
    const response = await GET(new Request("https://test/api/cron/chariow/sync", { headers: { authorization: "Bearer test-cron" } }));
    expect(response.status).toBe(200); expect((await response.json()).synced[0]).not.toHaveProperty("error");
  });
});
