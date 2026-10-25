import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn(), insert: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/crypto", () => ({ encryptSecret: (value: string) => `encrypted:${value}` }));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PINTEREST_APP_ID", "test-app");
  vi.stubEnv("PINTEREST_OAUTH_REDIRECT_URI", "https://preview.example/api/integrations/pinterest/callback");
  mocks.insert.mockResolvedValue({ error: null });
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.requireUser.mockResolvedValue({ user: { id: "user-1" }, supabase: { from: mocks.from } });
});
afterEach(() => vi.unstubAllEnvs());

describe("Pinterest Ads OAuth connection", () => {
  it("creates an OAuth state and requests read access for ads reports", async () => {
    const response = await GET(new Request("https://preview.example/api/integrations/pinterest/connect"));
    expect(response.status).toBe(307);
    const url = new URL(response.headers.get("location")!);
    expect(url.origin + url.pathname).toBe("https://www.pinterest.com/oauth/");
    expect(url.searchParams.get("client_id")).toBe("test-app");
    expect(url.searchParams.get("redirect_uri")).toBe("https://preview.example/api/integrations/pinterest/callback");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")!.split(",")).toContain("ads:read");
    const state = url.searchParams.get("state")!;
    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.from).toHaveBeenCalledWith("pinterest_oauth_states");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-1", state_hash: `encrypted:${state}` }));
  });

  it("does not start OAuth without an authenticated user", async () => {
    mocks.requireUser.mockResolvedValueOnce({ user: null, response: new Response("Unauthorized", { status: 401 }) });
    expect((await GET(new Request("https://preview.example/api/integrations/pinterest/connect"))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
