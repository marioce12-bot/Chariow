import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), requireAdmin: vi.fn(), rpc: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));

import { POST } from "@/app/api/track/route";
import { GET } from "@/app/api/admin/usage/route";

const sessionId = "123e4567-e89b-12d3-a456-426614174000";
const validBody = { session_id: sessionId, section: "Vue d'ensemble", seconds: 20, new_visit: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ user: { id: "authenticated-user" }, response: null });
  mocks.requireAdmin.mockResolvedValue({ admin: { id: "admin" }, response: null });
  mocks.rpc.mockResolvedValue({ data: { sections: [] }, error: null });
});

describe("POST /api/track", () => {
  it("attributes tracking to the authenticated user and forwards valid usage", async () => {
    const response = await POST(new Request("http://localhost/api/track", { method: "POST", body: JSON.stringify(validBody) }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("track_usage_heartbeat", {
      p_user_id: "authenticated-user", p_session_id: sessionId, p_section: "Vue d'ensemble", p_seconds: 20, p_new_visit: true,
    });
  });

  it("accepts both separate performance sections", async () => {
    for (const section of ["Performance visuel", "Performance publicitaire"]) {
      const response = await POST(new Request("http://localhost/api/track", { method: "POST", body: JSON.stringify({ ...validBody, section }) }));
      expect(response.status).toBe(200);
    }
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls.map(([, args]) => args.p_section)).toEqual(["Pub", "Pub"]);
  });

  it.each([
    { ...validBody, seconds: "not-a-number" },
    { ...validBody, seconds: 61 },
    { ...validBody, session_id: "bad-id" },
    { ...validBody, section: "made-up-section" },
    { ...validBody, new_visit: "true" },
  ])("rejects malformed or out-of-range client data: %o", async (body) => {
    const response = await POST(new Request("http://localhost/api/track", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("surfaces a failed RPC as a server error instead of reporting success", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "function missing" } });
    const response = await POST(new Request("http://localhost/api/track", { method: "POST", body: JSON.stringify(validBody) }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: expect.any(String) });
  });
});

describe("GET /api/admin/usage", () => {
  it("defaults to seven days and returns real RPC data", async () => {
    const response = await GET(new Request("http://localhost/api/admin/usage"));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("admin_usage_stats", { p_days: 7 });
  });

  it("rejects invalid ranges without querying", async () => {
    const response = await GET(new Request("http://localhost/api/admin/usage?days=0"));
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns a failure response when analytics RPC is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "function missing" } });
    const response = await GET(new Request("http://localhost/api/admin/usage"));
    expect(response.status).toBe(500);
  });
});
