import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { chariowSaleRows } from "@/lib/chariow/sales-rows";
import { invalidateChariowAnalytics } from "@/lib/chariow/analytics-cache";
import { verifyChariowSignature } from "@/lib/attribution-server";
import { notifyChariowSales } from "@/lib/chariow/sale-notifications";
import { invalidateCachedStoreProducts } from "@/lib/shop/products";
import { invalidateUserStoreList } from "@/lib/shop/cache";

export const runtime = "nodejs";
export const maxDuration = 60;
function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyChariowSignature(rawBody, request.headers.get("x-chariow-signature"), process.env.CHARIOW_PULSE_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid event object");
    event = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Payload invalide" }, { status: 400 });
  }

  const deliveryId = request.headers.get("x-pulse-delivery-id");
  // Signed provider test pulses intentionally have no delivery ID and must not persist anything.
  if (!deliveryId) return NextResponse.json({ received: true, test: true });
  const eventId = String(event.id ?? event.event_id ?? deliveryId);
  const eventType = String(event.type ?? event.event ?? "unknown");
  const sale = record(event.data ?? event.payload ?? event.sale ?? event);
  const saleId = String(sale.id ?? sale.sale_id ?? sale.order_id ?? "");
  if (!eventId || !saleId) return NextResponse.json({ error: "Événement Chariow invalide" }, { status: 400 });

  const metadata = record(sale.custom_metadata ?? sale.metadata);
  const internalStoreId = String(metadata.store_id ?? "") || null;
  const nativeStoreId = String(sale.store_id ?? record(sale.store).id ?? event.store_id ?? "") || null;
  if (!internalStoreId && !nativeStoreId) return NextResponse.json({ error: "Boutique non identifiée" }, { status: 400 });

  const supabase = createAdminClient();
  // Resolve every identifier against an active, connected Chariow store. Payload user_id is never trusted.
  const lookup = supabase.from("stores").select("id,user_id,store_name,connected_at,chariow_store_id")
    .eq("platform", "chariow").eq("is_active", true).eq("connection_status", "connected");
  const { data: store, error: storeError } = await lookup
    .eq(internalStoreId ? "id" : "chariow_store_id", internalStoreId ?? nativeStoreId!)
    .maybeSingle();
  if (storeError) return NextResponse.json({ error: "Boutique non vérifiée" }, { status: 500 });
  if (!store || (nativeStoreId && store.chariow_store_id && nativeStoreId !== store.chariow_store_id)) {
    return NextResponse.json({ error: "Boutique non vérifiée" }, { status: 404 });
  }

  const storeId = store.id;
  const status = String(sale.status ?? (eventType === "successful.sale" ? "paid" : eventType));
  const persistedSale = {
    ...sale,
    event_id: eventId,
    status,
    created_at: sale.created_at ?? sale.createdAt ?? event.created_at,
  };
  const row = chariowSaleRows(storeId, [persistedSale], store.user_id)[0];

  // The durable webhook ledger contains only the approved analytics allowlist.
  const { error: eventError } = await supabase.from("chariow_pulse_events").insert({
    event_id: eventId,
    store_id: storeId,
    user_id: store.user_id,
    status,
    amount: row.amount,
    currency: row.currency,
    product_id: row.product_id,
    product_name: row.product_name,
  });
  const duplicate = eventError?.code === "23505";
  // A duplicate may represent a previous interrupted attempt: continue to repair sale/signal persistence.
  if (eventError && !duplicate) return NextResponse.json({ error: "Événement non enregistré" }, { status: 500 });

  const { error: saleError } = await supabase.from("chariow_sales").upsert({
    ...row,
    product_id: String(metadata.product_id ?? row.product_id ?? "") || null,
    product_name: String(metadata.product_name ?? row.product_name ?? "") || null,
    status,
    event_type: eventType,
    raw_payload: row.raw_payload,
  }, { onConflict: "chariow_sale_id" });
  if (saleError) {
    if (!duplicate) await supabase.from("chariow_pulse_events").delete().eq("event_id", eventId);
    return NextResponse.json({ error: "Vente non enregistrée" }, { status: 500 });
  }

  if (eventType === "successful.sale") {
    try {
      await notifyChariowSales(store, [persistedSale]);
    } catch (error) {
      console.error("Chariow sale notification failed", error instanceof Error ? error.message : "unknown");
      if (!duplicate) await supabase.from("chariow_pulse_events").delete().eq("event_id", eventId);
      return NextResponse.json({ error: "Notification non enregistrée" }, { status: 500 });
    }
  }

  try {
    // Clear stale analytics before an INSERT can notify subscribers to refetch.
    await invalidateChariowAnalytics(storeId);
    invalidateCachedStoreProducts(storeId);
    invalidateUserStoreList(store.user_id);
  } catch (error) {
    console.error("Chariow analytics cache invalidation failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Cache analytique non invalidé" }, { status: 500 });
  }

  const { error: signalError } = await supabase.from("sales_events").upsert({
    event_id: eventId,
    store_id: storeId,
    user_id: store.user_id,
    status,
    amount: row.amount,
    currency: row.currency,
    product_id: row.product_id,
    product_name: row.product_name,
    created_at: row.occurred_at ?? new Date().toISOString(),
  }, { onConflict: "store_id,event_id", ignoreDuplicates: true });
  if (signalError) return NextResponse.json({ error: "Signal temps réel non enregistré" }, { status: 500 });
  return NextResponse.json({ received: true, ...(duplicate ? { duplicate: true } : {}) });
}
