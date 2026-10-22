import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptShopifyToken, encryptShopifyToken } from "./credentials";

describe("Shopify credential encryption", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips a token without exposing the plaintext", () => {
    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", "fixture-dedicated-encryption-key-with-sufficient-length");
    const encrypted = encryptShopifyToken("test-token-not-a-real-credential");
    expect(encrypted).not.toContain("test-token-not-a-real-credential");
    expect(decryptShopifyToken(encrypted)).toBe("test-token-not-a-real-credential");
  });

  it("rejects altered ciphertext, malformed values, and a different key", () => {
    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", "fixture-dedicated-encryption-key-with-sufficient-length");
    const encrypted = encryptShopifyToken("harmless-fixture-token");
    const [iv, tag, ciphertext] = encrypted.split(".");
    const alteredTag = Buffer.from(tag, "base64url");
    alteredTag[0] ^= 1;
    const altered = `${iv}.${alteredTag.toString("base64url")}.${ciphertext}`;
    expect(() => decryptShopifyToken(altered)).toThrow();
    expect(() => decryptShopifyToken("not-an-encrypted-value")).toThrow();
    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", "another-fixture-dedicated-key-with-sufficient-length");
    expect(() => decryptShopifyToken(encrypted)).toThrow();
  });

  it("requires a sufficiently long configured key", () => {
    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", "");
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");
    expect(() => encryptShopifyToken("fixture")).toThrow(/at least 32 characters/);
  });
});
