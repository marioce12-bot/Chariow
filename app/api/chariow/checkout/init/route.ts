import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createChariowCheckout } from "@/lib/chariow/checkout";
import { decryptSecret } from "@/lib/crypto";

function required(value: unknown, max = 255) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const storeId = required(body?.store_id, 100);
  const productId = required(body?.product_id, 255);
  const visitorId = required(body?.visitor_id, 128);
  const email = required(body?.email, 320);
  const firstName = required(body?.first_name, 120);
  const lastName = required(body?.last_name, 120);
  const phoneNumber = required(body?.phone?.number, 64);
  const countryCode = required(body?.phone?.country_code, 8);
  if (!storeId || !productId || !visitorId || !email || !firstName || !lastName || !phoneNumber || !countryCode) return NextResponse.json({ error: "Informations de checkout invalides" }, { status: 400 });
  const supabase = createAdminClient();
  const { data: store } = await supabase.from("stores").select("id,user_id,chariow_api_key_encrypted,is_active,platform").eq("id", storeId).eq("is_active", true).eq("platform", "chariow").maybeSingle();
  if (!store?.chariow_api_key_encrypted) return NextResponse.json({ error: "Clé API Checkout Chariow non configurée pour cette boutique" }, { status: 404 });
  const { data: touch } = await supabase.from("attribution_touches").select("visitor_id,store_id,utm_source,utm_medium,utm_campaign,utm_term,utm_content,fbclid,expires_at").eq("store_id", store.id).eq("visitor_id", visitorId).gt("expires_at", new Date().toISOString()).order("captured_at", { ascending: false }).limit(1).maybeSingle();
  const metadata = Object.fromEntries(Object.entries({ visitor_id: visitorId, store_id: store.id, product_id: productId, utm_source: touch?.utm_source, utm_medium: touch?.utm_medium, utm_campaign: touch?.utm_campaign, meta_adset_id: touch?.utm_term, meta_ad_id: touch?.utm_content, fbclid: touch?.fbclid }).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0).map(([key, value]) => [key, value.slice(0, 255)]));
  try {
    const customerIp = request.headers.get("x-forwarded-for")?.split(",").map((value) => value.trim()).find((value) => value && value.toLowerCase() !== "unknown") || request.headers.get("x-real-ip") || undefined;
    const data = await createChariowCheckout({ productId, email, firstName, lastName, phone: { number: phoneNumber, countryCode }, redirectUrl: typeof body?.redirect_url === "string" ? body.redirect_url.slice(0, 2048) : undefined, customerIp, customMetadata: metadata, apiKey: decryptSecret(store.chariow_api_key_encrypted) });
    if (data.step === "payment" && data.payment?.checkout_url) return NextResponse.json({ step: data.step, checkout_url: data.payment.checkout_url });
    if (data.step === "completed") return NextResponse.json({ step: data.step, completed: true });
    if (data.step === "already_purchased") return NextResponse.json({ step: data.step, already_purchased: true });
    return NextResponse.json({ error: "Réponse checkout Chariow inattendue" }, { status: 502 });
  } catch (error) {
    console.error("Chariow checkout initialization failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Impossible de créer le checkout Chariow" }, { status: 502 });
  }
}
