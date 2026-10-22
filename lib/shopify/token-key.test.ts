import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getShopifyConfigStatus } from "./auth";
import { decryptShopifyToken, encryptShopifyToken } from "./credentials";
import { getShopifyTokenEncryptionKey, hasShopifyTokenEncryptionKey } from "./token-key";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Shopify token encryption key", () => {
  it("encrypts and decrypts Shopify tokens using only the shared master key", () => {
    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", "");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "shopify-master-fixture-key-alpha-omega");

    expect(hasShopifyTokenEncryptionKey()).toBe(true);
    const encrypted = encryptShopifyToken("fixture-shopify-offline-token");
    expect(encrypted).not.toContain("fixture-shopify-offline-token");
    expect(decryptShopifyToken(encrypted)).toBe("fixture-shopify-offline-token");
  });

  it("reports Shopify configured with valid app settings and only the master key", () => {
    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", "");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "shopify-master-fixture-key-alpha-omega");
    vi.stubEnv("SHOPIFY_CLIENT_ID", "fixture-client-id");
    vi.stubEnv("SHOPIFY_CLIENT_SECRET", "valid-fixture-client-secret-alpha-omega");
    vi.stubEnv("SHOPIFY_APP_URL", "https://www.vendeo-studio.site");

    expect(getShopifyConfigStatus().configured).toBe(true);
  });

  it("derives a domain-separated Shopify key, not the legacy SHA-256 root key", () => {
    const root = "master-fixture-key-alpha-omega-and-more";
    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", "");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", root);

    const expected = crypto.createHmac("sha256", root).update("vendeo:shopify:token-encryption:v1", "utf8").digest();
    const legacy = crypto.createHash("sha256").update(root, "utf8").digest();
    expect(getShopifyTokenEncryptionKey()).toEqual(expected);
    expect(getShopifyTokenEncryptionKey()).not.toEqual(legacy);
  });

  it("prioritizes the dedicated key and retains its SHA-256 compatibility", () => {
    const dedicated = "dedicated-shopify-fixture-key-alpha-omega";
    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", dedicated);
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "shared-master-fixture-key-alpha-omega");

    expect(getShopifyTokenEncryptionKey()).toEqual(crypto.createHash("sha256").update(dedicated, "utf8").digest());
    const encrypted = encryptShopifyToken("legacy-compatible-shopify-token");
    expect(decryptShopifyToken(encrypted)).toBe("legacy-compatible-shopify-token");
  });

  it("reports missing or short keys as unavailable and rejects encryption without leaking key material", () => {
    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", "");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    expect(hasShopifyTokenEncryptionKey()).toBe(false);
    expect(() => getShopifyTokenEncryptionKey()).toThrow(/at least 32 characters/);

    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", "short-fixture");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    expect(hasShopifyTokenEncryptionKey()).toBe(false);
    expect(() => getShopifyTokenEncryptionKey()).toThrow(/at least 32 characters/);

    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", "");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "short-master-fixture");
    expect(hasShopifyTokenEncryptionKey()).toBe(false);
    expect(() => encryptShopifyToken("fixture-token")).toThrow(/at least 32 characters/);
    expect(() => getShopifyTokenEncryptionKey()).not.toThrow(/short-master-fixture/);
  });
});
