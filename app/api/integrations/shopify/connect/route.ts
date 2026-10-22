import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { resolveUserMaxStores } from "@/lib/plans";
import { getShopifyConfigStatus, normalizeShopDomain, SHOPIFY_SCOPES, SHOPIFY_STATE_COOKIE, SHOPIFY_STATE_TTL_SECONDS, signShopifyState } from "@/lib/shopify/auth";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const config = getShopifyConfigStatus();
  if (!config.configured) return NextResponse.json({ error: "Shopify OAuth n'est pas configuré" }, { status: 503 });
  const params = new URL(request.url).searchParams;
  const storeId = params.get("store_id");
  const requestedShop = normalizeShopDomain(params.get("shop"));
  let store: { id: string; shop_domain?: string | null; store_name?: string } | null = null;
  if (storeId) {
    const { data, error } = await supabase.from("stores").select("id, shop_domain, store_name").eq("id", storeId).eq("user_id", user.id).eq("platform", "shopify").eq("is_active", true).maybeSingle();
    if (error) return NextResponse.json({ error: "Impossible de vérifier la boutique" }, { status: 500 });
    store = data;
    if (!store) return NextResponse.json({ error: "Boutique Shopify introuvable" }, { status: 404 });
  }
  const shop = requestedShop ?? normalizeShopDomain(store?.shop_domain);
  if (!shop) return NextResponse.json({ error: "Domaine *.myshopify.com requis" }, { status: 400 });
  if (store?.shop_domain && normalizeShopDomain(store.shop_domain) !== shop) return NextResponse.json({ error: "Le domaine ne correspond pas à cette boutique" }, { status: 400 });
  if (!store) {
    const { data: existing, error } = await supabase.from("stores").select("id,shop_domain,store_name,is_active").eq("user_id", user.id).eq("platform", "shopify").eq("shop_domain", shop).maybeSingle();
    if (error) return NextResponse.json({ error: "Impossible de vérifier la boutique Shopify" }, { status: 500 });
    if (existing) {
      if (!existing.is_active) {
        const { count, error: countError } = await supabase.from("stores").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true);
        if (countError || (count ?? 0) >= await resolveUserMaxStores(supabase, user.id)) return NextResponse.json({ error: "Limite de boutiques atteinte" }, { status: 403 });
        const { error: restoreError } = await supabase.from("stores").update({ is_active: true }).eq("id", existing.id).eq("user_id", user.id);
        if (restoreError) return NextResponse.json({ error: "Impossible de réactiver la boutique" }, { status: 500 });
      }
      store = existing;
    }
  }
  if (!store) {
    const { count, error } = await supabase.from("stores").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_active", true);
    if (error) return NextResponse.json({ error: "Impossible de vérifier la limite de boutiques" }, { status: 500 });
    const maxStores = await resolveUserMaxStores(supabase, user.id);
    if ((count ?? 0) >= maxStores) return NextResponse.json({ error: `Ton abonnement autorise ${maxStores} boutiques maximum.` }, { status: 403 });
    const { data: created, error: createError } = await supabase.from("stores").insert({ user_id: user.id, platform: "shopify", store_name: shop.replace(".myshopify.com", ""), shop_domain: shop, mcp_url: null, access_token_encrypted: null, connection_status: "pending" }).select("id, shop_domain, store_name").single();
    if (createError) return NextResponse.json({ error: "Impossible de préparer la boutique Shopify" }, { status: 500 });
    store = created;
  } else if (!store.shop_domain) {
    const { error } = await supabase.from("stores").update({ shop_domain: shop, connection_status: "pending" }).eq("id", store.id).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: "Impossible de mettre à jour la boutique" }, { status: 500 });
  } else {
    await supabase.from("stores").update({ connection_status: "pending" }).eq("id", store.id).eq("user_id", user.id);
  }
  const issuedAt = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(32).toString("base64url");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { error: nonceError } = await admin.from("shopify_oauth_states").insert({ nonce_hash: crypto.createHash("sha256").update(nonce).digest("hex"), user_id: user.id, store_id: store.id, shop, expires_at: new Date((issuedAt + SHOPIFY_STATE_TTL_SECONDS) * 1000).toISOString() });
  if (nonceError) return NextResponse.json({ error: "Impossible de sécuriser la connexion Shopify" }, { status: 500 });
  const state = signShopifyState({ uid: user.id, storeId: store.id, shop, nonce, iat: issuedAt });
  const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
  authorize.searchParams.set("client_id", config.clientId!);
  authorize.searchParams.set("scope", SHOPIFY_SCOPES.join(","));
  authorize.searchParams.set("redirect_uri", config.redirectUri);
  authorize.searchParams.set("state", state);
  const result = NextResponse.redirect(authorize);
  result.cookies.set(SHOPIFY_STATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/integrations/shopify", maxAge: SHOPIFY_STATE_TTL_SECONDS });
  return result;
}
