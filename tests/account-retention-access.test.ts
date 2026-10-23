import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), subscription: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: m.getUser }, rpc: m.rpc }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: m.admin }));
vi.mock("@/lib/subscription/access", () => ({ requireActiveSubscription: m.subscription }));
import { requireUser } from "@/lib/auth";
import { POST as purge } from "@/app/api/cron/accounts/purge/route";
beforeEach(() => {
  vi.clearAllMocks();
  m.getUser.mockResolvedValue({ data: { user: { id: "synthetic" } }, error: null });
  m.rpc.mockResolvedValue({ data: { state: "active" }, error: null });
  m.subscription.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());
it("blocks pending users even on routes allowing unsubscribed users", async () => {
  m.rpc.mockResolvedValue({ data: { state: "pending" }, error: null });
  const result = await requireUser({ allowUnsubscribed: true });
  expect(result.user).toBeNull(); expect(result.response?.status).toBe(403);
  expect(m.subscription).not.toHaveBeenCalled();
});
it("fails closed on an unavailable retention migration", async () => {
  m.rpc.mockResolvedValue({ error: { message: "RPC absent" } });
  expect((await requireUser()).response?.status).toBe(503);
});
it("allows a pending account only through the explicit restoration bypass", async () => {
  expect((await requireUser({ allowUnsubscribed: true, allowPendingAccount: true })).user?.id).toBe("synthetic");
  expect(m.rpc).not.toHaveBeenCalled();
});
it("keeps subscription checks for active accounts", async () => {
  await requireUser(); expect(m.subscription).toHaveBeenCalledWith("synthetic");
});
it("never runs account purge in Production", async () => {
  vi.stubEnv("VERCEL_ENV", "production"); vi.stubEnv("ACCOUNT_RETENTION_PURGE_ENABLED", "true");
  expect((await purge(new Request("https://example.invalid"))).status).toBe(503);
  expect(m.admin).not.toHaveBeenCalled();
});
it("never runs account purge before explicit Preview opt-in", async () => {
  vi.stubEnv("VERCEL_ENV", "preview"); vi.stubEnv("ACCOUNT_RETENTION_PURGE_ENABLED", "false");
  expect((await purge(new Request("https://example.invalid"))).status).toBe(503);
  expect(m.admin).not.toHaveBeenCalled();
});
