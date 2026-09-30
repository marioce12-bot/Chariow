import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findPublishedStorefrontId } from "@/lib/shop/data";
import { recordShopEvent } from "@/lib/shop/events";
import { clientIp, rateLimit } from "@/lib/shop/rate-limit";
import { pickTrackingParams } from "@/lib/shop/tracking";

// Compteur de visites (public, sans authentification). Seules les visites sont acceptées ici :
// les clics d'achat sont enregistrés côté serveur dans /shop/[slug]/buy/[produit], pas depuis le navigateur.
export async function POST(request: Request) {
  if (rateLimit(`shop-track:${clientIp(request.headers)}`, 60)) return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || body.type !== "visit" || typeof body.slug !== "string") return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  const visitor = typeof body.visitor_id === "string" && body.visitor_id.length <= 128 && /^[A-Za-z0-9-]+$/.test(body.visitor_id) ? body.visitor_id : null;
  const storefrontId = await findPublishedStorefrontId(body.slug);
  if (!storefrontId) return NextResponse.json({ error: "Boutique indisponible" }, { status: 404 });
  const params = pickTrackingParams(new URLSearchParams(Object.entries(body).filter(([, value]) => typeof value === "string") as [string, string][]));
  await recordShopEvent(createAdminClient(), { storefrontId, type: "visit", visitorId: visitor, params });
  return NextResponse.json({ ok: true });
}
