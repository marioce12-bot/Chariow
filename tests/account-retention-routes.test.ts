import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ requireUser: vi.fn(), rpc: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: m.requireUser }));
import { GET, DELETE } from "@/app/api/account/route";
import { POST as restore } from "@/app/api/account/restore/route";
import { assertRetentionIsolation } from "@/lib/account-retention-isolation";

beforeEach(() => {
  vi.clearAllMocks();
  m.requireUser.mockResolvedValue({ user: { id: "fictional-user", email_confirmed_at: "2026-10-01" }, response: null, supabase: { rpc: m.rpc, auth: { signOut: m.signOut } } });
  m.rpc.mockResolvedValue({ data: { state: "pending", purge_after: "2027-01-21T00:00:00Z" }, error: null });
  m.signOut.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("account retention HTTP", () => {
  it("schedules deletion without deleting the Auth identity and signs out globally", async () => {
    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(m.rpc).toHaveBeenCalledWith("request_account_deletion");
    expect(m.signOut).toHaveBeenCalledWith({ scope: "global" });
    expect(await response.json()).toMatchObject({ deletion_scheduled: true, state: "pending" });
  });
  it("does not claim success when scheduling fails", async () => {
    m.rpc.mockResolvedValue({ error: { message: "test" } });
    expect((await DELETE()).status).toBe(503);
    expect(m.signOut).not.toHaveBeenCalled();
  });
  it("does not expose status to anonymous users", async () => {
    m.requireUser.mockResolvedValue({ user: null, response: new Response(null, { status: 401 }) });
    expect((await GET()).status).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("returns private status with no cache", async () => {
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ state: "pending" });
  });
  it("requires verified email for restoration", async () => {
    const ctx = await m.requireUser(); ctx.user.email_confirmed_at = null;
    m.requireUser.mockResolvedValue(ctx);
    expect((await restore()).status).toBe(403);
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("restores through atomic RPC without writing subscription or creating an account", async () => {
    m.rpc.mockResolvedValue({ data: { restored: true }, error: null });
    const response = await restore();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ restored: true });
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(m.rpc).toHaveBeenCalledWith("restore_account");
  });
  it("refuses expired restoration", async () => {
    m.rpc.mockResolvedValue({ error: { message: "RESTORATION_DEADLINE_PASSED" } });
    expect((await restore()).status).toBe(409);
  });
});

describe("Preview isolation", () => {
  it("fails closed without explicit isolated configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test-only.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_RETENTION_ISOLATED_HOST", "");
    expect(() => assertRetentionIsolation()).toThrow(/base isolée/);
  });
  it("always refuses the real Vendeo database even when allowlisted", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://wlroozwtsdlgaohdklif.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_RETENTION_ISOLATED_HOST", "wlroozwtsdlgaohdklif.supabase.co");
    expect(() => assertRetentionIsolation()).toThrow(/réelles/);
  });
  it("refuses Production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => assertRetentionIsolation()).toThrow(/Preview-only/);
  });
  it("allows explicitly configured localhost only for synthetic testing", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_RETENTION_ISOLATED_HOST", "127.0.0.1");
    expect(() => assertRetentionIsolation()).not.toThrow();
  });
});
