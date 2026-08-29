import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

function validSignature(rawBody: string, signature: string | null) {
  const secret = process.env.CHARIOW_PULSE_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = signature.replace(/^sha256=/, "");
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function amount(value: unknown) { const row = record(value); return Number(row.value ?? value ?? 0) || 0; }

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-chariow-signature"))) return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Payload invalide" }, { status: 400 }); }
  const deliveryId = request.headers.get("x-pulse-delivery-id");
  const eventId = String(event.id ?? event.event_id ?? deliveryId ?? "");
  const eventType = String(event.type ?? event.event ?? "unknown");
  const sale = record(event.data ?? event.payload ?? event.sale ?? event);
  const saleId = String(sale.id ?? sale.sale_id ?? sale.order_id ?? "");
  if (!deliveryId || !eventId || !saleId) return NextResponse.json({ error: "Événement Chariow invalide" }, { status: 400 });
  const supabase = createAdminClient();
  const { error: eventError } = await supabase.from("chariow_pulse_events").insert({ event_id: eventId, pulse_delivery_id: deliveryId, event_type: eventType, payload: event });
  if (eventError?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
  if (eventError) return NextResponse.json({ error: "Événement non enregistré" }, { status: 500 });

  if (eventType === "successful.sale") {
    const metadata = record(sale.custom_metadata ?? sale.metadata);
    const visitorId = String(metadata.visitor_id ?? "");
    const storeId = String(metadata.store_id ?? "");
    if (visitorId && storeId) {
      const { data: touch } = await supabase.from("attribution_touches").select("*").eq("store_id", storeId).eq("visitor_id", visitorId).gt("expires_at", new Date().toISOString()).order("captured_at", { ascending: false }).limit(1).maybeSingle();
      if (touch) {
        const settlement = record(sale.settlement);
        const campaign = String(metadata.utm_campaign ?? "") || null;
        await supabase.from("meta_attributions").upsert({ user_id: touch.user_id, store_id: storeId, sale_id: saleId, chariow_sale_id: saleId, product_id: String(metadata.product_id ?? sale.product_id ?? "") || null, visitor_id: visitorId, meta_campaign_id: campaign, meta_adset_id: String(metadata.meta_adset_id ?? metadata.utm_term ?? "") || null, meta_ad_id: String(metadata.meta_ad_id ?? metadata.utm_content ?? "") || null, campaign_id: campaign, attribution_method: metadata.fbclid ? "click_id" : "sale_metadata", utm_source: String(metadata.utm_source ?? "") || null, utm_medium: String(metadata.utm_medium ?? "") || null, utm_campaign: campaign, utm_content: String(metadata.utm_content ?? "") || null, utm_term: String(metadata.utm_term ?? "") || null, fbclid: String(metadata.fbclid ?? "") || null, attribution_model: "last_non_direct_click", attribution_confidence: metadata.fbclid ? 95 : 80, attributed_gross_revenue: amount(sale.amount), attributed_net_revenue: amount(settlement.amount), attributed_revenue: amount(settlement.amount), sale_status: String(sale.status ?? "completed"), settlement_done: Boolean(settlement.done_at), currency: String(record(sale.amount).currency ?? sale.currency ?? "") || null, attributed_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "chariow_sale_id" });
      }
    }
  }
  return NextResponse.json({ received: true });
}
