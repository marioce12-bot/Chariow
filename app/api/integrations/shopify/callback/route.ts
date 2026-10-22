import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptShopifyToken } from "@/lib/shopify/credentials";
import { getShopifyConfigStatus, normalizeShopDomain, SHOPIFY_STATE_COOKIE, verifyShopifyHmac, verifyShopifyState } from "@/lib/shopify/auth";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const { supabase, user } = await requireUser({ allowUnsubscribed: true });
  const url = new URL(request.url);
  const finish = (status: string) => {
    const response = NextResponse.redirect(new URL(`/dashboard?shopify=${encodeURIComponent(status)}`, url.origin));
    response.cookies.set(SHOPIFY_STATE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/integrations/shopify", maxAge: 0 });
    return response;
  };
  if (!user) return finish("auth_required");
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SHOPIFY_STATE_COOKIE)?.value;
  const rawState = url.searchParams.get("state") ?? undefined;
  const state = verifyShopifyState(cookie, user.id);
  if (!state || !rawState || !safeEqual(rawState, cookie!)) return finish("invalid_state");
  const shop = normalizeShopDomain(url.searchParams.get("shop"));
  if (!shop || shop !== state.shop || !verifyShopifyHmac(url.searchParams)) return finish("invalid_signature");
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096) return finish("missing_code");
  const config = getShopifyConfigStatus();
  if (!config.configured) return finish("not_configured");
  const { data: ownedStore, error: ownerError } = await supabase.from("stores").select("id, shop_domain").eq("id", state.storeId).eq("user_id", user.id).eq("platform", "shopify").eq("is_active", true).maybeSingle();
  if (ownerError || !ownedStore || normalizeShopDomain(ownedStore.shop_domain) !== shop) return finish("store_not_found");
  try {
    const admin = createAdminClient();
    const crypto = await import("node:crypto");
    const { data: consumed, error: nonceError } = await admin.from("shopify_oauth_states").delete().eq("nonce_hash", crypto.createHash("sha256").update(state.nonce).digest("hex")).eq("user_id", user.id).eq("store_id", state.storeId).eq("shop", shop).gte("expires_at", new Date().toISOString()).select("nonce_hash").maybeSingle();
    if (nonceError || !consumed) return finish("invalid_state");
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET, code, expiring: 1 }), signal: AbortSignal.timeout(10000), cache: "no-store", redirect: "error" });
    if (!tokenResponse.ok) return finish("token_exchange_failed");
    const tokens = await tokenResponse.json() as { access_token?: string; scope?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number };
    const scopes = (tokens.scope ?? "").split(",").map((v) => v.trim()).filter(Boolean);
    if (!tokens.access_token || !Number.isFinite(tokens.expires_in) || !tokens.refresh_token || !Number.isFinite(tokens.refresh_token_expires_in) || !SHOPIFY_SCOPES.every((scope) => scopes.includes(scope))) return finish("invalid_token_response");
    const now = Date.now();
    const { error: saveError } = await admin.from("shopify_connections").upsert({ store_id: state.storeId, user_id: user.id, shop, access_token_encrypted: encryptShopifyToken(tokens.access_token), refresh_token_encrypted: encryptShopifyToken(tokens.refresh_token), scopes, access_token_expires_at: new Date(now + tokens.expires_in! * 1000).toISOString(), refresh_token_expires_at: new Date(now + tokens.refresh_token_expires_in! * 1000).toISOString(), updated_at: new Date(now).toISOString() }, { onConflict: "store_id" });
    if (saveError) { console.error("Shopify credentials persistence failed", saveError.message); return finish("save_failed"); }
    const { error: publicError } = await supabase.from("stores").update({ platform: "shopify", store_name: shop.replace(".myshopify.com", ""), shop_domain: shop, mcp_url: null, access_token_encrypted: null, connection_status: "connected", connection_error: null, connected_at: new Date(now).toISOString() }).eq("id", state.storeId).eq("user_id", user.id);
    if (publicError) { console.error("Shopify store update failed", publicError.message); return finish("save_failed"); }
    return finish("connected");
  } catch (error) {
    console.error("Shopify OAuth callback failed", error instanceof Error ? error.message : "unknown");
    return finish("oauth_failed");
  }
}
function safeEqual(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && require("node:crypto").timingSafeEqual(left, right);
}
import { SHOPIFY_SCOPES } from "@/lib/shopify/auth";
