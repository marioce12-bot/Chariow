import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chariowSaleRows } from "@/lib/chariow/sales-rows";
import { verifyChariowSignature } from "@/lib/attribution-server";
import { notifyChariowSales } from "@/lib/chariow/sale-notifications";

export const runtime = "nodejs";
export const maxDuration = 60;
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
  // Signed provider test pulses must never create a sale or a notification.
  if (!deliveryId) return NextResponse.json({ received: true, test: true });
  const { error: eventError } = await supabase.from("chariow_pulse_events").insert({ event_id: eventId, pulse_delivery_id: deliveryId, event_type: eventType, payload: event });
  const duplicate = eventError?.code === "23505";
  // Reprocess duplicate deliveries idempotently: an earlier request may have
  // persisted the event but failed before creating its sale notification.
  if (eventError && !duplicate) return NextResponse.json({ error: "Événement non enregistré" }, { status: 500 });
  const metadata = record(sale.custom_metadata ?? sale.metadata);
  const internalStoreId = String(metadata.store_id ?? "") || null;
  const nativeStoreId = String(sale.store_id ?? record(sale.store).id ?? event.store_id ?? "") || null;
  let store: { id: string; user_id: string; store_name: string; connected_at?: string | null } | null = null;
  if (internalStoreId || nativeStoreId) {
    const lookup = supabase.from("stores").select("id,user_id,store_name,connected_at")
      .eq("platform", "chariow").eq("is_active", true).eq("connection_status", "connected");
    const { data, error: storeError } = await lookup.eq(internalStoreId ? "id" : "chariow_store_id", internalStoreId ?? nativeStoreId!).maybeSingle();
    if (storeError) return NextResponse.json({ error: "Boutique non vérifiée" }, { status: 500 });
    store = data;
  }
  const storeId = store?.id ?? internalStoreId;
  const row = chariowSaleRows(storeId ?? "", [sale])[0];
  const { error: saleError } = await supabase.from("chariow_sales").upsert({ ...row, store_id: storeId, product_id: String(metadata.product_id ?? row.product_id ?? "") || null, status: String(sale.status ?? eventType), event_type: eventType, raw_payload: event }, { onConflict: "chariow_sale_id" });
  if (saleError) {
    await supabase.from("chariow_pulse_events").delete().eq("event_id", eventId);
    return NextResponse.json({ error: "Vente non enregistrée" }, { status: 500 });
  }

  if (store && eventType === "successful.sale") {
    try {
      // Resolve the recipient from our trusted store record, never a user_id
      // supplied by the webhook payload. Disconnected stores are not notified.
      await notifyChariowSales(store, [{ ...sale, status: sale.status ?? "paid", created_at: sale.created_at ?? sale.createdAt ?? event.created_at }]);
    } catch (error) {
      console.error("Chariow sale notification failed", error instanceof Error ? error.message : "unknown");
      await supabase.from("chariow_pulse_events").delete().eq("event_id", eventId);
      return NextResponse.json({ error: "Notification non enregistrée" }, { status: 500 });
    }
  }
  return NextResponse.json({ received: true, ...(duplicate ? { duplicate: true } : {}) });
}
