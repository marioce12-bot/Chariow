import { afterEach, describe, expect, it } from "vitest";
import { decryptShopifyToken, encryptShopifyToken } from "./credentials";

describe("Shopify credential encryption", () => {
  const previous = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY;
  afterEach(() => {
    if (previous === undefined) delete process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY;
    else process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = previous;
  });

  it("round-trips a token without exposing the plaintext", () => {
    process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = "test-only-encryption-key-0123456789";
    const encrypted = encryptShopifyToken("test-token-not-a-real-credential");
    expect(encrypted).not.toContain("test-token-not-a-real-credential");
    expect(decryptShopifyToken(encrypted)).toBe("test-token-not-a-real-credential");
  });

  it("rejects altered ciphertext, malformed values, and a different key", () => {
    process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = "test-only-encryption-key-0123456789";
    const encrypted = encryptShopifyToken("harmless-fixture-token");
    const [iv, tag, ciphertext] = encrypted.split(".");
    const altered = `${iv}.${tag.slice(0, -1)}${tag.endsWith("A") ? "B" : "A"}.${ciphertext}`;
    expect(() => decryptShopifyToken(altered)).toThrow();
    expect(() => decryptShopifyToken("not-an-encrypted-value")).toThrow();
    process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY = "another-test-only-encryption-key-012345";
    expect(() => decryptShopifyToken(encrypted)).toThrow();
  });

  it("requires a sufficiently long configured key", () => {
    delete process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptShopifyToken("fixture")).toThrow(/at least 32 characters/);
  });
});
