import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getChariowSnapshot } from "@/lib/chariow/analytics";
import { chariowSaleRows } from "@/lib/chariow/sales-rows";
import { autoMapChariowCampaigns } from "@/lib/attribution/auto-map";

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
      const rows = chariowSaleRows(store.id, snapshot.sales);
      if (rows.length) {
        const { error: upsertError } = await supabase.from("chariow_sales").upsert(rows, { onConflict: "chariow_sale_id" });
        if (upsertError) throw upsertError;
      }
      // Rattachement automatique (conservateur) des campagnes Chariow aux campagnes
      // pub ; une erreur ici ne doit jamais faire échouer la synchro des ventes.
      let campaignsMapped = 0;
      try {
        campaignsMapped = await autoMapChariowCampaigns(supabase, store, rows);
      } catch (mapError) {
        console.error("chariow sync: auto-map failed", store.id, mapError instanceof Error ? mapError.message : mapError);
      }
      await supabase.from("stores").update({ connection_status: "connected", last_verified_at: new Date().toISOString(), connection_error: null, sales_last_synced_at: new Date().toISOString(), sales_last_sync_complete: snapshot.coverage?.sales.complete ?? false, sales_sync_error: snapshot.coverage?.sales.reason ?? null }).eq("id", store.id);
      results.push({ store_id: store.id, store_name: store.store_name, sales_synced: rows.length, coverage: snapshot.coverage, campaigns_mapped: campaignsMapped });
    } catch (syncError) {
      results.push({ store_id: store.id, error: syncError instanceof Error ? syncError.message : String(syncError) });
    }
  }
  return NextResponse.json({ synced: results });
}

// Vercel Cron appelle les routes en GET (jamais en POST) : sans ce handler, la
// route répondait 405 à chaque passage et chariow_sales restait vide.
export async function GET(request: Request) {
  return POST(request);
}
