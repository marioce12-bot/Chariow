import crypto from "node:crypto";

const SHOPIFY_KEY_CONTEXT = "vendeo:shopify:token-encryption:v1";

export function hasShopifyTokenEncryptionKey(): boolean {
  const configured = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY;
  return (configured?.length ?? 0) >= 32;
}

export function getShopifyTokenEncryptionKey(): Buffer {
  const dedicated = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY;
  if (dedicated) {
    if (dedicated.length < 32) throw new Error("Shopify token encryption key must be at least 32 characters");
    // Preserve compatibility with tokens encrypted before shared-key support.
    return crypto.createHash("sha256").update(dedicated, "utf8").digest();
  }
  const shared = process.env.TOKEN_ENCRYPTION_KEY;
  if (!shared || shared.length < 32) throw new Error("Shopify token encryption key must be at least 32 characters");
  // Domain-separated key: never reuse the key used by the legacy adapters.
  return crypto.createHmac("sha256", shared).update(SHOPIFY_KEY_CONTEXT, "utf8").digest();
}
