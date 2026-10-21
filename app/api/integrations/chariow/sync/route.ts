import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { chariowSaleRows } from "@/lib/chariow/sales-rows";
import { getChariowSnapshot } from "@/lib/chariow/analytics";
import { notifyChariowSales } from "@/lib/chariow/sale-notifications";

async function syncStore(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], userId: string, store: { id: string; mcp_url: string | null; access_token_encrypted: string | null; store_name: string; connected_at?: string | null }) {
  const snapshot = await getChariowSnapshot(store);
  const rows = chariowSaleRows(store.id, snapshot.sales);
  if (rows.length) {
    const { error } = await supabase.from("chariow_sales").upsert(rows, { onConflict: "chariow_sale_id" });
    if (error) throw error;
  }
  try {
    await notifyChariowSales({ ...store, user_id: userId }, snapshot.sales);
  } catch (notificationError) {
    console.error("chariow manual sync: sale notification failed", store.id, notificationError instanceof Error ? notificationError.message : "unknown");
  }
  await supabase.from("stores").update({ connection_status: "connected", last_verified_at: new Date().toISOString(), connection_error: null, sales_last_synced_at: new Date().toISOString(), sales_last_sync_complete: snapshot.coverage?.sales.complete ?? false, sales_sync_error: snapshot.coverage?.sales.reason ?? null }).eq("id", store.id).eq("user_id", userId);
  return { store_id: store.id, store_name: store.store_name, sales_synced: rows.length, coverage: snapshot.coverage };
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = Boolean(cronSecret && request.headers.get("authorization") === `Bearer ${cronSecret}`);
  const auth = await requireUser();
  if (!isCron && !auth.user) return auth.response;
  const userId = auth.user?.id;
  const db = createAdminClient();
  const query = db.from("stores").select("id, mcp_url, access_token_encrypted, store_name, user_id, connected_at").eq("platform", "chariow").eq("is_active", true);
  const { data: stores, error } = userId ? await query.eq("user_id", userId) : await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results = [];
  for (const store of stores ?? []) {
    try {
      results.push(await syncStore(db, store.user_id, store));
    } catch (syncError) {
      results.push({ store_id: store.id, error: syncError instanceof Error ? syncError.message : String(syncError) });
    }
  }
  return NextResponse.json({ synced: results });
}
