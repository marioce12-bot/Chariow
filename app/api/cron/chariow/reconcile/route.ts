import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function amount(value: unknown) { const row = record(value); return Number(row.value ?? value ?? 0) || 0; }
function rows(value: unknown) { const row = record(value); return Array.isArray(value) ? value : Array.isArray(row.data) ? row.data : Array.isArray(row.items) ? row.items : []; }

async function fetchSale(apiKey: string, saleId?: string) {
  const url = saleId ? `https://api.chariow.com/v1/sales/${encodeURIComponent(saleId)}` : "https://api.chariow.com/v1/sales";
  const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Chariow sales returned ${response.status}`);
  return response.json();
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  const { data: stores } = await supabase.from("stores").select("id,user_id,chariow_api_key_encrypted").eq("platform", "chariow").eq("is_active", true).not("chariow_api_key_encrypted", "is", null).limit(100);
  let reconciled = 0;
  for (const store of stores ?? []) {
    const apiKey = decryptSecret(store.chariow_api_key_encrypted);
    const listing = await fetchSale(apiKey);
    for (const item of rows(listing)) {
      const sale = record(item);
      const saleId = String(sale.id ?? sale.sale_id ?? "");
      if (!saleId) continue;
      const detail = await fetchSale(apiKey, saleId);
      const fullSale = record(detail.data ?? detail.sale ?? detail);
      const metadata = record(fullSale.custom_metadata ?? fullSale.metadata);
      const visitorId = String(metadata.visitor_id ?? "");
      if (!visitorId) continue;
      const { data: touch } = await supabase.from("attribution_touches").select("*").eq("store_id", store.id).eq("visitor_id", visitorId).order("captured_at", { ascending: false }).limit(1).maybeSingle();
      if (!touch || fullSale.status !== "completed") continue;
      const settlement = record(fullSale.settlement);
      await supabase.from("meta_attributions").upsert({ user_id: touch.user_id, store_id: store.id, sale_id: saleId, chariow_sale_id: saleId, product_id: String(metadata.product_id ?? fullSale.product_id ?? "") || null, visitor_id: visitorId, meta_campaign_id: String(metadata.utm_campaign ?? "") || null, meta_adset_id: String(metadata.meta_adset_id ?? metadata.utm_term ?? "") || null, meta_ad_id: String(metadata.meta_ad_id ?? metadata.utm_content ?? "") || null, attribution_method: metadata.fbclid ? "click_id" : "sale_metadata", utm_source: String(metadata.utm_source ?? "") || null, utm_medium: String(metadata.utm_medium ?? "") || null, utm_campaign: String(metadata.utm_campaign ?? "") || null, utm_content: String(metadata.utm_content ?? "") || null, utm_term: String(metadata.utm_term ?? "") || null, fbclid: String(metadata.fbclid ?? "") || null, attribution_model: "last_non_direct_click", attribution_confidence: metadata.fbclid ? 95 : 80, attributed_gross_revenue: amount(fullSale.amount), attributed_net_revenue: amount(settlement.amount), attributed_revenue: amount(settlement.amount), sale_status: String(fullSale.status), settlement_done: Boolean(settlement.done_at), currency: String(record(fullSale.amount).currency ?? fullSale.currency ?? "") || null, attributed_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "chariow_sale_id" });
      reconciled += 1;
    }
  }
  return NextResponse.json({ reconciled });
}
