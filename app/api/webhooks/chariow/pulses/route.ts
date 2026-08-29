import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const event = JSON.parse(await request.text()) as Record<string, unknown>;
  const eventId = String(event.id ?? event.event_id ?? "");
  const eventType = String(event.type ?? event.event ?? "unknown");
  const sale = (event.data ?? event.payload ?? event.sale ?? event) as Record<string, unknown>;
  const saleId = String(sale.id ?? sale.sale_id ?? sale.order_id ?? "");
  if (!eventId || !saleId) return NextResponse.json({ error: "Événement Chariow invalide" }, { status: 400 });
  const supabase = createAdminClient();
  const { error: eventError } = await supabase.from("chariow_pulse_events").insert({ event_id: eventId, event_type: eventType, payload: event });
  if (eventError?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
  if (eventError) return NextResponse.json({ error: "Événement non enregistré" }, { status: 500 });
  if (["sale.completed", "sale.settled", "completed", "settled"].includes(eventType)) {
    const metadata = sale.metadata && typeof sale.metadata === "object" ? sale.metadata as Record<string, unknown> : {};
    const visitorId = String(sale.visitor_id ?? metadata.visitor_id ?? "");
    if (visitorId) {
      const { data: touch } = await supabase.from("attribution_touches").select("*").eq("visitor_id", visitorId).order("captured_at", { ascending: false }).limit(1).maybeSingle();
      if (touch) await supabase.from("meta_attributions").upsert({ user_id: touch.user_id, store_id: touch.store_id, sale_id: saleId, chariow_sale_id: saleId, product_id: String(sale.product_id ?? "") || null, campaign_id: touch.utm_campaign ?? null, attribution_method: touch.fbclid ? "click_id" : "utm", utm_source: touch.utm_source, utm_medium: touch.utm_medium, utm_campaign: touch.utm_campaign, utm_content: touch.utm_content, utm_term: touch.utm_term, fbclid: touch.fbclid, attribution_model: "last_non_direct_click", attribution_confidence: touch.fbclid ? 95 : 80, attributed_revenue: Number(sale.net_amount ?? sale.amount ?? sale.total ?? 0) || 0, currency: String(sale.currency ?? "") || null, attributed_at: new Date().toISOString() }, { onConflict: "user_id,store_id,sale_id" });
    }
  }
  return NextResponse.json({ received: true });
}
