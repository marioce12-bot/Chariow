import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
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

async function syncStore(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string, store: { id: string; mcp_url: string | null; access_token_encrypted: string | null; store_name: string }) {
  const snapshot = await getChariowSnapshot(store);
  const sales = arrayValue(snapshot.sales);
  const rows = sales.map((item) => {
    const sale = record(item);
    const settlement = record(sale.settlement);
    const campaign = campaignFields(sale);
    const saleId = String(sale.id ?? sale.sale_id ?? sale.order_id ?? "");
    return {
      chariow_sale_id: saleId,
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
    const { error } = await supabase.from("chariow_sales").upsert(rows, { onConflict: "chariow_sale_id" });
    if (error) throw error;
  }
  await supabase.from("stores").update({ connection_status: "connected", last_verified_at: new Date().toISOString(), connection_error: null }).eq("id", store.id).eq("user_id", userId);
  return { store_id: store.id, store_name: store.store_name, sales_synced: rows.length };
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = Boolean(cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`);
  const auth = await requireUser();
  if (!isCron && !auth.user) return auth.response;
  const userId = auth.user?.id;
  const query = auth.supabase.from("stores").select("id, mcp_url, access_token_encrypted, store_name, user_id").eq("platform", "chariow").eq("is_active", true);
  const { data: stores, error } = userId ? await query.eq("user_id", userId) : await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results = [];
  for (const store of stores ?? []) {
    try {
      results.push(await syncStore(auth.supabase, store.user_id, store));
    } catch (syncError) {
      results.push({ store_id: store.id, error: syncError instanceof Error ? syncError.message : String(syncError) });
    }
  }
  return NextResponse.json({ synced: results });
}
