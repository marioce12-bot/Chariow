import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
import { GET } from "./route";

const secret = "test-shopify-secret-key-long-enough-for-hmac-123";

function installUrl(params: Record<string, string>, hmacOverride?: string) {
  const message = Object.entries(params)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const hmac = hmacOverride ?? crypto.createHmac("sha256", secret).update(message).digest("hex");
  const search = new URLSearchParams({ ...params, hmac });
  return `https://www.vendeo-studio.site/api/integrations/shopify/install?${search.toString()}`;
}

const baseParams = () => ({
  shop: "demo-store.myshopify.com",
  host: "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvZGVtbw",
  timestamp: String(Math.floor(Date.now() / 1000)),
});

beforeEach(() => {
  process.env.SHOPIFY_CLIENT_SECRET = secret;
  mocks.getUser.mockReset();
});

describe("Shopify install entry route", () => {
  it("redirects a signed request from a logged-in user to the connect flow", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const response = await GET(new Request(installUrl(baseParams())));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/api/integrations/shopify/connect");
    expect(location.searchParams.get("shop")).toBe("demo-store.myshopify.com");
  });

  it("sends a signed request without a Vendeo session to the login page", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const response = await GET(new Request(installUrl(baseParams())));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });

  it("rejects an invalid signature without checking the session", async () => {
    const response = await GET(new Request(installUrl(baseParams(), "0".repeat(64))));
    expect(new URL(response.headers.get("location")!).searchParams.get("shopify")).toBe("invalid_signature");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("rejects a domain that is not an exact myshopify.com hostname", async () => {
    const response = await GET(new Request(installUrl({ ...baseParams(), shop: "evil.example.com" })));
    expect(new URL(response.headers.get("location")!).searchParams.get("shopify")).toBe("invalid_shop");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("rejects an expired timestamp", async () => {
    const response = await GET(new Request(installUrl({ ...baseParams(), timestamp: String(Math.floor(Date.now() / 1000) - 3600) })));
    expect(new URL(response.headers.get("location")!).searchParams.get("shopify")).toBe("invalid_signature");
  });
});
