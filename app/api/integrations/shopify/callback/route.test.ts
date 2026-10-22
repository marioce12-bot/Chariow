import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(), cookies: vi.fn(), createAdminClient: vi.fn(),
  consumed: true, store: { id: "11111111-1111-4111-8111-111111111111", shop_domain: "fixture.myshopify.com" } as any,
  deleteCalls: 0,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));

import { GET } from "./route";
import { SHOPIFY_STATE_COOKIE, signShopifyState } from "@/lib/shopify/auth";

const user = { id: "user-fixture" };
const storeId = "11111111-1111-4111-8111-111111111111";
const shop = "fixture.myshopify.com";

function signedUrl(state: string, overrides: Record<string, string> = {}) {
  const params = new URLSearchParams({ code: "fixture-code", shop, state, timestamp: `${Math.floor(Date.now() / 1000)}`, ...overrides });
  const message = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
  params.set("hmac", crypto.createHmac("sha256", process.env.SHOPIFY_CLIENT_SECRET!).update(message).digest("hex"));
  return new Request(`https://app.example/api/integrations/shopify/callback?${params}`);
}

describe("Shopify OAuth callback", () => {
  const oldEnv = { id: process.env.SHOPIFY_CLIENT_ID, secret: process.env.SHOPIFY_CLIENT_SECRET, key: process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY };
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SHOPIFY_CLIENT_ID = "fixture-client";
    process.env.SHOPIFY_CLIENT_SECRET = "test-only-shopify-client-secret-long-enough";
    process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = "test-only-encryption-key-0123456789";
    mocks.consumed = true; mocks.deleteCalls = 0;
    mocks.store = { id: storeId, shop_domain: shop };
    mocks.requireUser.mockResolvedValue({ user, supabase: { from: () => ({ select: () => ({ eq() { return this; }, maybeSingle: async () => ({ data: mocks.store, error: null }) }), update: () => ({ eq() { return this; }, then(resolve: any) { return Promise.resolve({ error: null }).then(resolve); } }) }) } });
    mocks.cookies.mockImplementation(async () => ({ get: () => ({ value: currentState }) }));
    mocks.createAdminClient.mockImplementation(() => ({ from: (table: string) => table === "shopify_oauth_states" ? ({
      delete: () => ({ eq() { return this; }, gte() { return this; }, select() { return this; }, maybeSingle: async () => { mocks.deleteCalls++; return { data: mocks.consumed ? { nonce_hash: "used-once" } : null, error: null }; } }),
    }) : ({ upsert: async () => ({ error: null }) }) }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600, refresh_token_expires_in: 7200, scope: "read_products,read_orders" }) }));
  });
  afterEach(() => {
    for (const [name, value] of Object.entries({ SHOPIFY_CLIENT_ID: oldEnv.id, SHOPIFY_CLIENT_SECRET: oldEnv.secret, SHOPIFY_TOKEN_ENCRYPTION_KEY: oldEnv.key })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    vi.unstubAllGlobals();
  });
  let currentState = "";
  function makeState(uid = user.id) {
    currentState = signShopifyState({ uid, storeId, shop, nonce: "n".repeat(40), iat: Math.floor(Date.now() / 1000) });
    return currentState;
  }
  const status = (response: Response) => new URL(response.headers.get("location")!).searchParams.get("shopify");

  it("consumes the persisted nonce once; a replay does not exchange a token", async () => {
    const state = makeState();
    const first = await GET(signedUrl(state));
    expect(status(first)).toBe("connected");
    expect(mocks.deleteCalls).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    mocks.consumed = false;
    const replay = await GET(signedUrl(state));
    expect(status(replay)).toBe("invalid_state");
    expect(mocks.deleteCalls).toBe(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a different owner and invalid HMAC before any network request", async () => {
    const otherOwner = makeState("some-other-user");
    const wrongOwnerResponse = await GET(signedUrl(otherOwner));
    expect(status(wrongOwnerResponse)).toBe("invalid_state");
    const validState = makeState();
    const bad = new URL(signedUrl(validState).url);
    bad.searchParams.set("hmac", "0".repeat(64));
    expect(status(await GET(new Request(bad)))).toBe("invalid_signature");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.deleteCalls).toBe(0);
  });

  it("rejects a validly signed state for an unowned shop without network access", async () => {
    const state = makeState();
    mocks.store = { id: storeId, shop_domain: "another.myshopify.com" };
    expect(status(await GET(signedUrl(state)))).toBe("store_not_found");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.deleteCalls).toBe(0);
  });
});
