import crypto from "node:crypto";
export function verifyShopifyWebhook(raw: Buffer, signature: string | null, secret = process.env.SHOPIFY_CLIENT_SECRET): boolean {
  if (!secret || secret.length < 32 || !signature || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature)) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest();
  const actual = Buffer.from(signature, "base64");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
