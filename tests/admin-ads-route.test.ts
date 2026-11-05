import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), createAdminClient: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
import { GET } from "@/app/api/admin/ads/route";
beforeEach(() => { vi.clearAllMocks(); mocks.createAdminClient.mockReturnValue({ rpc: mocks.rpc }); });
describe("admin ads route", () => {
  it("authorizes before any privileged read", async () => {
    mocks.requireAdmin.mockResolvedValue({ admin: null, response: Response.json({ error: "denied" }, { status: 401 }) });
    expect((await GET(new Request("http://localhost/api/admin/ads"))).status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
  it("rejects an invalid period before creating the DB client", async () => {
    mocks.requireAdmin.mockResolvedValue({ admin: { role: "analyst" } });
    expect((await GET(new Request("http://localhost/api/admin/ads?period=8d"))).status).toBe(400);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
  it("passes the selected period bounds to the database function", async () => {
    mocks.requireAdmin.mockResolvedValue({ admin: { role: "analyst" } });
    mocks.rpc.mockResolvedValue({ data: { total_launched: 12, active_in_period: 3 }, error: null });
    const response = await GET(new Request("http://localhost/api/admin/ads?period=custom&start=2026-10-01&end=2026-10-31&timeZone=UTC"));
    const body = await response.json();
    expect(mocks.rpc).toHaveBeenCalledWith("admin_ads_metrics", { p_start: "2026-10-01T00:00:00.000Z", p_end: "2026-10-31T23:59:59.999Z" });
    expect(body.ads).toMatchObject({ total_launched: 12, active_in_period: 3, period: { preset: "custom" } });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("never replaces a failure with zero and hides database details", async () => {
    mocks.requireAdmin.mockResolvedValue({ admin: { role: "analyst" } });
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "private" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(new Request("http://localhost/api/admin/ads"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Ads metrics unavailable" });
  });
  it("uses the whole history when no bound applies", async () => {
    mocks.requireAdmin.mockResolvedValue({ admin: { role: "analyst" } });
    mocks.rpc.mockResolvedValue({ data: { total_launched: 1, active_in_period: 1 }, error: null });
    await GET(new Request("http://localhost/api/admin/ads?period=all"));
    expect(mocks.rpc.mock.calls[0][1].p_start).toBeNull();
  });
});
