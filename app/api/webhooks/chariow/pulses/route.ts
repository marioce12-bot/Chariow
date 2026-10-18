import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chariowSaleRows } from "@/lib/chariow/sales-rows";
import { verifyChariowSignature } from "@/lib/attribution-server";

function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyChariowSignature(rawBody, request.headers.get("x-chariow-signature"), process.env.CHARIOW_PULSE_WEBHOOK_SECRET) && process.env.NODE_ENV === "production") return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody) as Record<string, unknown>; } catch { return NextResponse.json({ error: "Payload invalide" }, { status: 400 }); }
  const deliveryId = request.headers.get("x-pulse-delivery-id");
  const eventId = String(event.id ?? event.event_id ?? deliveryId ?? "");
  const eventType = String(event.type ?? event.event ?? "unknown");
  const sale = record(event.data ?? event.payload ?? event.sale ?? event);
  const saleId = String(sale.id ?? sale.sale_id ?? sale.order_id ?? "");
  if (!eventId || !saleId) return NextResponse.json({ error: "Événement Chariow invalide" }, { status: 400 });
  const supabase = createAdminClient();
  // Chariow's signed test pulse has no delivery id and must never create financial attribution.
  if (!deliveryId) return NextResponse.json({ received: true, test: true });
  const { error: eventError } = await supabase.from("chariow_pulse_events").insert({ event_id: eventId, pulse_delivery_id: deliveryId, event_type: eventType, payload: event });
  if (eventError?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
  if (eventError) return NextResponse.json({ error: "Événement non enregistré" }, { status: 500 });
  const metadata = record(sale.custom_metadata ?? sale.metadata);
  const storeId = String(metadata.store_id ?? sale.store_id ?? "") || null;
  const row = chariowSaleRows(storeId ?? "", [sale])[0];
  const { error: saleError } = await supabase.from("chariow_sales").upsert({ ...row, store_id: storeId, product_id: String(metadata.product_id ?? row.product_id ?? "") || null, status: String(sale.status ?? eventType), event_type: eventType, raw_payload: event }, { onConflict: "chariow_sale_id" });
  if (saleError) {
    // Allow the provider retry to reprocess this delivery instead of acknowledging a lost sale.
    await supabase.from("chariow_pulse_events").delete().eq("event_id", eventId);
    return NextResponse.json({ error: "Vente non enregistrée" }, { status: 500 });
  }

  if (eventType === "successful.sale") {
    // Native Chariow campaign data is persisted with the sale. Attribution to
    // Meta is resolved later through meta_campaign_mappings; it no longer uses
    // visitor_id, which is unavailable on chariow.com checkout pages.
  }
  return NextResponse.json({ received: true });
}
