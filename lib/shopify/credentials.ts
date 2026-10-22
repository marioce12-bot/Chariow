import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShopifyTokenEncryptionKey } from "./token-key";

function encryptionKey() {
  return getShopifyTokenEncryptionKey();
}
export function encryptShopifyToken(token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}
export function decryptShopifyToken(value: string) {
  const [iv, tag, ciphertext, extra] = value.split(".");
  if (!iv || !tag || !ciphertext || extra) throw new Error("Invalid encrypted Shopify token format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
export interface ShopifyCredentials { shop: string; accessToken: string; scopes: string[] }
export async function getShopifyCredentials(storeId: string): Promise<ShopifyCredentials> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("shopify_connections").select("shop, access_token_encrypted, refresh_token_encrypted, scopes, access_token_expires_at, refresh_token_expires_at, user_id").eq("store_id", storeId).maybeSingle();
  if (error) throw new Error(`Unable to load Shopify credentials: ${error.message}`);
  if (!data) throw new Error("Shopify credentials not found");
  const { data: store, error: storeError } = await admin.from("stores").select("is_active, platform, connection_status, user_id").eq("id", storeId).eq("user_id", data.user_id).maybeSingle();
  if (storeError) throw new Error(`Unable to verify Shopify store: ${storeError.message}`);
  if (store?.platform !== "shopify" || !store?.is_active || store?.connection_status !== "connected") throw new Error("Shopify store is not connected");
  const expires = Date.parse(data.access_token_expires_at);
  if (expires > Date.now() + 60_000) return { shop: data.shop, accessToken: decryptShopifyToken(data.access_token_encrypted), scopes: data.scopes ?? [] };
  if (Date.parse(data.refresh_token_expires_at) <= Date.now()) throw new Error("Shopify refresh token expired; reconnect the store");
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Shopify OAuth is not configured");
  const response = await fetch(`https://${data.shop}/admin/oauth/access_token`, {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: decryptShopifyToken(data.refresh_token_encrypted) }),
    signal: AbortSignal.timeout(10_000), cache: "no-store",
  });
  if (!response.ok) throw new Error("Shopify token refresh failed; reconnect the store");
  const fresh = await response.json() as { access_token?: string; scope?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number };
  if (!fresh.access_token || !fresh.refresh_token || !Number.isFinite(fresh.expires_in) || !Number.isFinite(fresh.refresh_token_expires_in)) throw new Error("Shopify returned an invalid rotated token response");
  const updatedAt = new Date().toISOString();
  const scopes = (fresh.scope ?? data.scopes?.join(",") ?? "").split(",").map((scope: string) => scope.trim()).filter(Boolean);
  const { error: updateError } = await admin.from("shopify_connections").update({ access_token_encrypted: encryptShopifyToken(fresh.access_token), refresh_token_encrypted: encryptShopifyToken(fresh.refresh_token), scopes, access_token_expires_at: new Date(Date.now() + fresh.expires_in! * 1000).toISOString(), refresh_token_expires_at: new Date(Date.now() + fresh.refresh_token_expires_in! * 1000).toISOString(), updated_at: updatedAt }).eq("store_id", storeId).eq("refresh_token_encrypted", data.refresh_token_encrypted);
  if (updateError) throw new Error("Could not persist rotated Shopify tokens");
  return { shop: data.shop, accessToken: fresh.access_token, scopes };
}
