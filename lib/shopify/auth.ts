import crypto from "node:crypto";
import { hasShopifyTokenEncryptionKey } from "./token-key";

export const SHOPIFY_SCOPES = ["read_products", "read_orders"] as const;
export const SHOPIFY_STATE_COOKIE = "vendeo_shopify_oauth_state";
export const SHOPIFY_STATE_TTL_SECONDS = 600;
export const SHOPIFY_CALLBACK_PATH = "/api/integrations/shopify/callback";

export function normalizeShopDomain(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim().toLowerCase().replace(/\.$/, "");
  if (value.length > 253 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/.test(value)) return null;
  return value;
}

function stateSecret() {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret || secret.length < 32) throw new Error("SHOPIFY_CLIENT_SECRET must be configured");
  return secret;
}
export interface ShopifyState { uid: string; storeId: string; shop: string; nonce: string; iat: number }
export function signShopifyState(state: ShopifyState) {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const mac = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}
export function verifyShopifyState(value: string | undefined, userId: string, now = Date.now()): ShopifyState | null {
  try {
    if (!value) return null;
    const [payload, signature, extra] = value.split(".");
    if (!payload || !signature || extra) return null;
    const expected = crypto.createHmac("sha256", stateSecret()).update(payload).digest();
    const supplied = Buffer.from(signature, "base64url");
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ShopifyState;
    if (parsed.uid !== userId || typeof parsed.storeId !== "string" || !/^[0-9a-f-]{36}$/i.test(parsed.storeId) || !normalizeShopDomain(parsed.shop) || typeof parsed.nonce !== "string" || parsed.nonce.length < 32 || !Number.isInteger(parsed.iat)) return null;
    if (parsed.iat > now / 1000 + 30 || now / 1000 - parsed.iat > SHOPIFY_STATE_TTL_SECONDS) return null;
    return parsed;
  } catch { return null; }
}

export function verifyShopifyHmac(params: URLSearchParams, secret = process.env.SHOPIFY_CLIENT_SECRET, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret) return false;
  const hmac = params.get("hmac");
  const timestamp = params.get("timestamp");
  if (!hmac || !/^[a-f0-9]{64}$/i.test(hmac) || !timestamp || !/^\d{10}$/.test(timestamp)) return false;
  const issued = Number(timestamp);
  if (Math.abs(nowSeconds - issued) > 300) return false;
  const message = [...params.entries()].filter(([key]) => key !== "hmac" && key !== "signature").sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join("&");
  const expected = crypto.createHmac("sha256", secret).update(message).digest();
  const supplied = Buffer.from(hmac, "hex");
  return supplied.length === expected.length && crypto.timingSafeEqual(expected, supplied);
}

export function getShopifyConfigStatus() {
  const appUrl = (process.env.SHOPIFY_APP_URL || "https://www.vendeo-studio.site").replace(/\/$/, "");
  let validUrl = false;
  try { const parsed = new URL(appUrl); validUrl = parsed.origin === "https://www.vendeo-studio.site" && parsed.pathname === "/" && !parsed.search && !parsed.hash && !parsed.username && !parsed.password; } catch { /* invalid */ }
  const configured = Boolean(process.env.SHOPIFY_CLIENT_ID && (process.env.SHOPIFY_CLIENT_SECRET?.length ?? 0) >= 32 && hasShopifyTokenEncryptionKey() && validUrl);
  return { configured, clientId: process.env.SHOPIFY_CLIENT_ID || null, appUrl, redirectUri: `${appUrl}${SHOPIFY_CALLBACK_PATH}`, scopes: [...SHOPIFY_SCOPES] };
}
