import { beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { normalizeShopDomain, signShopifyState, verifyShopifyHmac, verifyShopifyState } from "./auth";

const secret = "test-shopify-secret-key-long-enough-for-hmac-123";
beforeEach(() => { process.env.SHOPIFY_CLIENT_SECRET = secret; });
describe("Shopify OAuth security helpers", () => {
  it("accepts only exact myshopify hostnames (no URL, port, suffix trick or private IP)", () => {
    expect(normalizeShopDomain(" Acme-Store.myshopify.com ")).toBe("acme-store.myshopify.com");
    for (const invalid of ["https://acme.myshopify.com", "acme.myshopify.com:443", "acme.myshopify.com.evil.test", "127.0.0.1.myshopify.com", "-bad.myshopify.com", "a..myshopify.com", "shop.com"]) expect(normalizeShopDomain(invalid)).toBeNull();
  });
  it("verifies signed user-bound state and rejects tampering, other users, and expired state", () => {
    const now = 1_800_000_000_000;
    const state = signShopifyState({ uid: "user-1", storeId: "12345678-1234-1234-1234-123456789012", shop: "acme.myshopify.com", nonce: crypto.randomBytes(32).toString("base64url"), iat: Math.floor(now / 1000) });
    expect(verifyShopifyState(state, "user-1", now)?.shop).toBe("acme.myshopify.com");
    expect(verifyShopifyState(state, "user-2", now)).toBeNull();
    expect(verifyShopifyState(`${state}x`, "user-1", now)).toBeNull();
    expect(verifyShopifyState(state, "user-1", now + 601_000)).toBeNull();
  });
  it("validates Shopify HMAC with timing-safe comparison and a fresh timestamp", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const params = new URLSearchParams({ shop: "acme.myshopify.com", code: "code", state: "opaque", timestamp });
    const message = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
    params.set("hmac", crypto.createHmac("sha256", secret).update(message).digest("hex"));
    expect(verifyShopifyHmac(params)).toBe(true);
    params.set("code", "changed");
    expect(verifyShopifyHmac(params)).toBe(false);
    const stale = new URLSearchParams({ shop: "acme.myshopify.com", timestamp: "1000000000", hmac: "0".repeat(64) });
    expect(verifyShopifyHmac(stale)).toBe(false);
  });
});
