import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn(), stores: [] as any[], failDelete: false, updates: [] as any[], lookups: 0 }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/lib/shopify/sync", () => ({ syncShopifyStore: vi.fn() }));
import { POST } from "./route";
import { verifyShopifyWebhook } from "@/lib/shopify/webhooks";

describe("Shopify webhook HMAC", () => {
  const secret = "x".repeat(40);
  const body = Buffer.from('{"id":42,"customer":{"email":"private@example.test"}}');
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64");
  it("accepts the exact raw body and valid base64 signature", () => expect(verifyShopifyWebhook(body, signature, secret)).toBe(true));
  it("rejects body changes, malformed signatures, and absent secrets", () => {
    expect(verifyShopifyWebhook(Buffer.from(body.toString() + " "), signature, secret)).toBe(false);
    expect(verifyShopifyWebhook(body, "not base64!", secret)).toBe(false);
    expect(verifyShopifyWebhook(body, signature, undefined)).toBe(false);
  });
});

describe("Shopify lifecycle webhooks", () => {
  const secret = "test-only-webhook-secret-more-than-32";
  const stores = [
    { id: "store-a", user_id: "user-a", platform: "shopify", connected_at: null, is_active: true, connection_status: "connected", shop_domain: "fixture.myshopify.com" },
    { id: "store-b", user_id: "user-b", platform: "shopify", connected_at: null, is_active: true, connection_status: "connected", shop_domain: "fixture.myshopify.com" },
  ];
  beforeEach(() => {
    process.env.SHOPIFY_CLIENT_SECRET = secret;
    mocks.stores = stores.map((s) => ({ ...s })); mocks.failDelete = false; mocks.updates = []; mocks.lookups = 0;
    mocks.createAdminClient.mockImplementation(() => ({ from(table: string) {
      let filters: Record<string, any> = {};
      const chain: any = {
        select() { return chain; }, eq(k: string, v: any) { filters[k] = v; return chain; }, range() {
          if (table === "stores") { mocks.lookups++; return Promise.resolve({ data: mocks.stores.filter((s) => Object.entries(filters).every(([k, v]) => s[k] === v)), error: null }); }
          return chain;
        }, delete() { return chain; }, like() { return chain; }, contains() { return chain; },
        update(patch: any) { mocks.updates.push({ patch, filters: { ...filters } }); return { ...chain, eq(k: string, v: any) { filters[k] = v; mocks.updates[mocks.updates.length - 1].filters = { ...filters }; return this; } }; },
        then(resolve: any, reject: any) { if (mocks.failDelete && table === "shopify_connections") return Promise.resolve({ error: { message: "temporary failure" } }).then(resolve, reject); return Promise.resolve({ error: null }).then(resolve, reject); },
      };
      return chain;
    } }));
  });
  afterEach(() => { delete process.env.SHOPIFY_CLIENT_SECRET; });
  async function send(topic: string) {
    const raw = Buffer.from("{}");
    const hmac = crypto.createHmac("sha256", secret).update(raw).digest("base64");
    return POST(new Request("https://app.example/api/webhooks/shopify", { method: "POST", body: raw, headers: { "x-shopify-hmac-sha256": hmac, "x-shopify-shop-domain": "fixture.myshopify.com", "x-shopify-topic": topic } }));
  }

  it("revokes every matching store on uninstall; failed cleanup returns retryable 503", async () => {
    mocks.failDelete = true;
    const failed = await send("app/uninstalled");
    expect(failed.status).toBe(503);
    mocks.failDelete = false;
    const response = await send("app/uninstalled");
    expect(response.status).toBe(200);
    expect(mocks.lookups).toBe(2);
    expect(mocks.updates).toHaveLength(2);
    expect(mocks.updates.map((u) => u.patch)).toEqual([
      { is_active: false, connection_status: "revoked" },
      { is_active: false, connection_status: "revoked" },
    ]);
  });

  it("locates shops from stores after credentials are absent and redacts all stores", async () => {
    const response = await send("shop/redact");
    expect(response.status).toBe(200);
    expect(mocks.lookups).toBe(1);
    expect(mocks.updates).toHaveLength(2);
    for (const { patch, filters } of mocks.updates) {
      expect(filters).toMatchObject({ id: expect.stringMatching(/^store-/), platform: "shopify" });
      expect(patch).toMatchObject({ is_active: false, connection_status: "revoked", shop_domain: null, sales_last_synced_at: null, sales_sync_error: null });
    }
  });
});
