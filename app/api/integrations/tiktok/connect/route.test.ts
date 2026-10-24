import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/crypto", () => ({ encryptSecret: (value: string) => `encrypted:${value}` }));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TIKTOK_APP_ID", "test-app");
  vi.stubEnv("TIKTOK_OAUTH_REDIRECT_URI", "https://preview.example/api/integrations/tiktok/callback");
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.requireUser.mockResolvedValue({ user: { id: "user-1" }, supabase: { from: mocks.from } });
});
afterEach(() => vi.unstubAllEnvs());

describe("TikTok Ads OAuth connection", () => {
  it("shows the required-account step before redirecting to authorize", async () => {
    const response = await GET(new Request("https://preview.example/api/integrations/tiktok/connect"));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("J'ai un compte publicitaire, continuer");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("creates an expiring OAuth state and redirects to TikTok Business", async () => {
    const response = await GET(new Request("https://preview.example/api/integrations/tiktok/connect?confirmed=1"));
    expect(response.status).toBe(307);
    const url = new URL(response.headers.get("location")!);
    expect(url.origin + url.pathname).toBe("https://business-api.tiktok.com/portal/auth");
    expect(url.searchParams.get("app_id")).toBe("test-app");
    expect(url.searchParams.get("redirect_uri")).toBe("https://preview.example/api/integrations/tiktok/callback");
    const state = url.searchParams.get("state")!;
    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.from).toHaveBeenCalledWith("tiktok_oauth_states");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-1", state_hash: `encrypted:${state}` }));
  });

  it("does not start OAuth without an authenticated user", async () => {
    mocks.requireUser.mockResolvedValueOnce({ user: null, response: new Response("Unauthorized", { status: 401 }) });
    expect((await GET(new Request("https://preview.example/api/integrations/tiktok/connect?confirmed=1"))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
