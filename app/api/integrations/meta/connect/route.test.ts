import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/crypto", () => ({ encryptSecret: (value: string) => `encrypted:${value}` }));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("META_APP_ID", "test-app");
  vi.stubEnv("META_OAUTH_REDIRECT_URI", "https://preview.example/api/integrations/meta/callback");
  vi.stubEnv("META_GRAPH_VERSION", "v23.0");
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.requireUser.mockResolvedValue({ user: { id: "user-1" }, supabase: { from: mocks.from } });
});
afterEach(() => vi.unstubAllEnvs());

describe("Meta OAuth scopes", () => {
  it("removes only pages_manage_ads, preserving every other scope and OAuth state", async () => {
    const response = await GET(new Request("https://preview.example/api/integrations/meta/connect"));
    expect(response.status).toBe(307);
    const url = new URL(response.headers.get("location")!);
    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v23.0/dialog/oauth");
    expect(url.searchParams.get("scope")!.split(",")).toEqual([
      "ads_read", "ads_management", "ads_mcp_management", "business_management", "pages_show_list", "pages_read_engagement",
    ]);
    expect(url.searchParams.get("scope")).not.toContain("pages_manage_ads");
    expect(url.searchParams.get("client_id")).toBe("test-app");
    expect(url.searchParams.get("redirect_uri")).toBe("https://preview.example/api/integrations/meta/callback");
    const state = url.searchParams.get("state")!;
    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.from).toHaveBeenCalledWith("meta_oauth_states");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-1", state_hash: `encrypted:${state}` }));
  });

  it("does not prepare OAuth for an unauthenticated user", async () => {
    mocks.requireUser.mockResolvedValueOnce({ user: null, response: new Response("Unauthorized", { status: 401 }) });
    expect((await GET(new Request("https://preview.example/api/integrations/meta/connect"))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("fails closed when OAuth state cannot be stored", async () => {
    mocks.insert.mockResolvedValueOnce({ error: { code: "test", message: "unavailable" } });
    const response = await GET(new Request("https://preview.example/api/integrations/meta/connect"));
    expect(response.status).toBe(500);
    expect(response.headers.get("location")).toBeNull();
  });
});
