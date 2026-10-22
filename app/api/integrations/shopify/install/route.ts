import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeShopDomain, verifyShopifyHmac } from "@/lib/shopify/auth";

export const runtime = "nodejs";

/**
 * Point d'entrée de l'« App URL » Shopify.
 *
 * Quand un marchand installe ou ouvre l'app depuis son admin Shopify (ou quand
 * l'équipe de revue Shopify l'installe), Shopify appelle cette URL avec `shop`,
 * `timestamp`, `host` et `hmac`. On vérifie la signature, puis on relance le
 * flux de connexion existant (/api/integrations/shopify/connect), qui crée la
 * boutique, le nonce et le cookie d'état avant de rediriger vers Shopify.
 *
 * Aucun jeton n'est échangé ici : tout le reste passe par connect/callback.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const fail = (status: string) =>
    NextResponse.redirect(new URL(`/dashboard?shopify=${encodeURIComponent(status)}`, url.origin));

  const shop = normalizeShopDomain(url.searchParams.get("shop"));
  if (!shop) return fail("invalid_shop");
  if (!verifyShopifyHmac(url.searchParams)) return fail("invalid_signature");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Pas de session Vendeo : on envoie vers la connexion. Une fois connecté, le
  // marchand peut relancer l'ouverture depuis Shopify ou ajouter la boutique
  // depuis le dashboard.
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));

  const connect = new URL("/api/integrations/shopify/connect", url.origin);
  connect.searchParams.set("shop", shop);
  return NextResponse.redirect(connect);
}
