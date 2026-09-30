import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveBuyTarget } from "@/lib/shop/data";
import { recordShopEvent } from "@/lib/shop/events";
import { clientIp, rateLimit } from "@/lib/shop/rate-limit";
import { pickTrackingParams, readVisitorId, withTrackingParams } from "@/lib/shop/tracking";

// Bouton « Acheter » : enregistre le clic puis redirige vers le lien de paiement Chariow du produit,
// en conservant les paramètres UTM / fbclid de la visite. Le lien est re-validé (https + domaine autorisé) à chaque clic.
export async function GET(request: Request, { params }: { params: Promise<{ slug: string; produit: string }> }) {
  if (rateLimit(`shop-buy:${clientIp(request.headers)}`, 60)) return new NextResponse("Trop de requêtes", { status: 429 });
  const { slug, produit } = await params;
  const target = await resolveBuyTarget(slug, produit);
  if (!target) return new NextResponse("Boutique indisponible", { status: 404, headers: { "Cache-Control": "no-store" } });

  const tracking = pickTrackingParams(new URL(request.url).searchParams);
  await recordShopEvent(createAdminClient(), {
    storefrontId: target.storefrontId,
    type: "buy_click",
    productId: produit,
    visitorId: readVisitorId(request.headers.get("cookie")),
    params: tracking,
  }).catch(() => undefined);

  return NextResponse.redirect(withTrackingParams(target.url, tracking), { status: 302, headers: { "Cache-Control": "no-store" } });
}
