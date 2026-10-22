import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncShopifyStore } from "@/lib/shopify/sync";
export const maxDuration = 60;
async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return NextResponse.json({ error: "Cron non configuré" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: stores, error } = await admin.from("stores").select("id,user_id,store_name,connected_at").eq("platform", "shopify").eq("is_active", true).eq("connection_status", "connected").order("sales_last_synced_at", { ascending: true, nullsFirst: true }).order("id", { ascending: true }).limit(20);
  if (error) return NextResponse.json({ error: "Impossible de charger les boutiques Shopify" }, { status: 500 });
  const results = [];
  const deadline = Date.now() + 45_000;
  for (const store of stores ?? []) {
    if (Date.now() > deadline) break;
    try { results.push(await syncShopifyStore(store)); }
    catch { results.push({ store_id: store.id, error: "sync_failed" }); }
  }
  return NextResponse.json({ synced: results, deferred: (stores?.length ?? 0) - results.length, batch_limit: 20 });
}
export const GET = run;
export const POST = run;
