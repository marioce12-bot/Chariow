import { createAdminClient } from "@/lib/supabase/admin";
import { getShopifySnapshot } from "@/lib/shopify/client";
import { normalizeShopifySnapshot } from "@/lib/shopify/analytics";
import { shopifySaleRows } from "@/lib/shopify/sales";
import { autoMapChariowCampaigns } from "@/lib/attribution/auto-map";
import { notifyShopifySales } from "@/lib/shopify/notifications";
type Store = { id: string; user_id: string; store_name?: string; connected_at?: string | null; [key: string]: any };
export async function syncShopifyStore(store: Store) {
 if (!store?.id || !store.user_id) throw new Error("Boutique Shopify invalide");
 const snapshot = await getShopifySnapshot(store), normalized = normalizeShopifySnapshot(snapshot, snapshot.period), rows = shopifySaleRows(store.id, normalized.sales), admin = createAdminClient();
 if (rows.length) { const { error } = await admin.from("chariow_sales").upsert(rows, { onConflict: "chariow_sale_id" }); if (error) throw new Error(`Échec d'enregistrement des ventes Shopify: ${error.message}`); }
 const coverage = snapshot.coverage?.sales;
 const { error: updateError } = await admin.from("stores").update({ connection_status: "connected", sales_last_synced_at: new Date().toISOString(), sales_last_sync_complete: false, sales_sync_error: coverage?.complete ? "Synchronisation limitée aux 60 derniers jours; couverture historique non complète." : coverage?.reason ?? "Couverture historique Shopify limitée à 60 jours." }).eq("id", store.id).eq("user_id", store.user_id).eq("platform", "shopify");
 if (updateError) throw new Error(`Échec mise à jour des métadonnées Shopify: ${updateError.message}`);
 let campaignsMapped = 0; try { campaignsMapped = await autoMapChariowCampaigns(admin, store, rows); } catch (error) { console.error("Shopify campaign mapping failed", error); }
 await notifyShopifySales(store, normalized.sales);
 return { store_id: store.id, sales_synced: rows.length, coverage: snapshot.coverage, historical_complete: false, campaigns_mapped: campaignsMapped };
}
