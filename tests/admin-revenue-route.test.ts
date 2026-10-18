import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), createAdminClient: vi.fn(), readRevenue: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/admin-revenue", () => ({ readRevenue: mocks.readRevenue }));
import { GET } from "@/app/api/admin/revenue/route";
beforeEach(() => vi.clearAllMocks());
describe("admin revenue route", () => {
  it("authorizes before any privileged read", async () => {
    mocks.requireAdmin.mockResolvedValue({ admin: null, response: Response.json({ error: "denied" }, { status: 401 }) });
    expect((await GET()).status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.readRevenue).not.toHaveBeenCalled();
  });
  it("returns only aggregate data with private no-store headers", async () => {
    mocks.requireAdmin.mockResolvedValue({ admin: { role: "analyst" } });
    const summary = { complete: true, total: 800, subscriptions: 0, studio: 800, currency: "XOF" };
    mocks.readRevenue.mockResolvedValue(summary);
    const response = await GET();
    expect(await response.json()).toEqual({ revenue: summary });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("does not expose database errors or replace failures with zero", async () => {
    mocks.requireAdmin.mockResolvedValue({ admin: { role: "super_admin" } });
    mocks.readRevenue.mockRejectedValue(new Error("private DB details"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Revenue unavailable" });
  });
});
