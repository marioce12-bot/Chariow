import { beforeEach, describe, expect, it, vi } from "vitest";
const { requireUser, createAdminClient, fetchCelebrationSales } = vi.hoisted(() => ({ requireUser: vi.fn(), createAdminClient: vi.fn(), fetchCelebrationSales: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/chariow/celebration", () => ({ fetchCelebrationSales }));
import { POST } from "./route";
const uid = "u1";
function setup(stores: unknown[], rpc: (args: any) => any = () => ({ data: 1, error: null }), baseline: any = null) {
  const storeQuery: any = { select: vi.fn(() => storeQuery), eq: vi.fn(() => storeQuery), then: undefined };
  storeQuery.then = (resolve: any) => Promise.resolve({ data: stores, error: null }).then(resolve);
  const baselineQuery: any = { select: vi.fn(() => baselineQuery), eq: vi.fn(() => baselineQuery), maybeSingle: vi.fn(async () => ({ data: baseline, error: null })) };
  createAdminClient.mockReturnValue({ from: vi.fn((table: string) => table === "stores" ? storeQuery : baselineQuery), rpc: vi.fn((_name: string, args: any) => Promise.resolve(rpc(args))) });
}
describe("POST /api/sales/celebration", () => {
  beforeEach(() => { vi.clearAllMocks(); requireUser.mockResolvedValue({ user: { id: uid }, response: null }); });
  it("rejects unauthenticated requests", async () => {
    requireUser.mockResolvedValue({ user: null, response: Response.json({ error: "auth" }, { status: 401 }) });
    const response = await POST();
    expect(response.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
  it("scans all active stores and invokes atomic RPC per store", async () => {
    setup([{ id: "s1" }, { id: "s2" }]);
    fetchCelebrationSales.mockResolvedValue([{ id: "sale", occurred_at: "2026-10-19T00:00:00Z" }]);
    const response = await POST();
    expect(await response.json()).toEqual({ celebrate: true, count: 2 });
    expect(fetchCelebrationSales).toHaveBeenCalledTimes(2);
    expect(createAdminClient.mock.results[0].value.rpc).toHaveBeenCalledTimes(2);
    expect(fetchCelebrationSales).toHaveBeenCalledWith({ id: "s1" }, expect.objectContaining({ from: expect.any(String) }));
    const admin = createAdminClient.mock.results[0].value;
    expect(admin.from.mock.results[0].value.eq).toHaveBeenCalledWith("connection_status", "connected");
    expect(createAdminClient.mock.results[0].value.rpc.mock.calls[0][1]).toHaveProperty("p_observed_at");
  });
  it("fails closed per store on incomplete scan or RPC error", async () => {
    setup([{ id: "s1" }, { id: "s2" }], () => ({ data: null, error: new Error("no") }));
    fetchCelebrationSales.mockRejectedValueOnce(new Error("partial coverage")).mockResolvedValueOnce([]);
    const response = await POST();
    expect(await response.json()).toEqual({ celebrate: false, count: 0 });
  });
  it("filters API stores to connected and uses saved baseline UTC date as fetch filter", async () => {
    setup([{ id: "s1" }], () => ({ data: 0, error: null }), { baseline_at: "2026-10-17T23:59:00-02:00" });
    fetchCelebrationSales.mockResolvedValue([]);
    await POST();
    expect(fetchCelebrationSales).toHaveBeenCalledWith({ id: "s1" }, { from: "2026-10-18" });
  });
});
