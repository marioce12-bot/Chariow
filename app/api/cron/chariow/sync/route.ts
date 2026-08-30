import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getChariowSnapshot } from "@/lib/chariow/analytics";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const row = record(value);
  for (const key of ["data", "items", "sales", "results"]) if (Array.isArray(row[key])) return row[key] as unknown[];
  return [];
}
function amount(value: unknown) {
  const row = record(value);
  return Number(row.value ?? value ?? 0) || 0;
}
function campaignFields(sale: Record<string, unknown>) {
  const metadata = record(sale.custom_metadata ?? sale.metadata);
  const campaign = record(sale.campaign ?? metadata.campaign ?? metadata.marketing_campaign);
  return {
    id: String(campaign.id ?? campaign.campaign_id ?? sale.campaign_id ?? metadata.campaign_id ?? "") || null,
    name: String(campaign.name ?? campaign.title ?? sale.campaign_name ?? metadata.campaign_name ?? "") || null,
  };
}
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const supabase = createAdminClient();
  const { data: stores, error } = await supabase.from("stores").select("id,user_id,mcp_url,access_token_encrypted,store_name").eq("platform", "chariow").eq("is_active", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results = [];
  for (const store of stores ?? []) {
    try {
      const snapshot = await getChariowSnapshot(store);
      const rows = arrayValue(snapshot.sales).map((item) => {
        const sale = record(item);
        const settlement = record(sale.settlement);
        const campaign = campaignFields(sale);
        return {
          chariow_sale_id: String(sale.id ?? sale.sale_id ?? sale.order_id ?? ""),
          store_id: store.id,
          product_id: String(sale.product_id ?? record(sale.product).id ?? "") || null,
          chariow_campaign_id: campaign.id,
          chariow_campaign_name: campaign.name,
          status: String(sale.status ?? "unknown"),
          amount: amount(sale.amount),
          net_amount: amount(settlement.amount ?? sale.net_amount),
          currency: String(record(sale.amount).currency ?? sale.currency ?? "") || null,
          settlement_done: Boolean(settlement.done_at),
          event_type: "list_sales.sync",
          occurred_at: String(sale.created_at ?? sale.createdAt ?? new Date().toISOString()),
          updated_at: new Date().toISOString(),
          raw_payload: sale,
        };
      }).filter((row) => row.chariow_sale_id);
      if (rows.length) {
        const { error: upsertError } = await supabase.from("chariow_sales").upsert(rows, { onConflict: "chariow_sale_id" });
        if (upsertError) throw upsertError;
      }
      await supabase.from("stores").update({ connection_status: "connected", last_verified_at: new Date().toISOString(), connection_error: null }).eq("id", store.id);
      results.push({ store_id: store.id, store_name: store.store_name, sales_synced: rows.length });
    } catch (syncError) {
      results.push({ store_id: store.id, error: syncError instanceof Error ? syncError.message : String(syncError) });
    }
  }
  return NextResponse.json({ synced: results });
}
