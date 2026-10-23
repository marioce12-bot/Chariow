import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeShopDomain } from "@/lib/shopify/auth";
import { syncShopifyStore } from "@/lib/shopify/sync";
import { verifyShopifyWebhook } from "@/lib/shopify/webhooks";
import { requestedOrderIds, redactRequestedShopifyOrders, exportRequestedShopifyOrders } from "@/lib/shopify/privacy-requests";
export const runtime = "nodejs";
const MAX_BODY = 1024 * 1024;
async function matchingStores(admin: any, shop: string) {
 const found: any[] = []; let from = 0;
 while (true) { const { data, error } = await admin.from("stores").select("id,user_id,platform,connected_at,is_active,connection_status,shop_domain").eq("platform", "shopify").eq("shop_domain", shop).range(from, from + 99); if (error) throw error; found.push(...(data ?? [])); if (!data || data.length < 100) break; from += 100; }
 return found;
}
async function cleanupStore(admin: any, store: any, redact: boolean) {
 if (redact) {
  const { error: salesError } = await admin.from("chariow_sales").delete().eq("store_id", store.id).like("chariow_sale_id", `shopify:${store.id}:%`); if (salesError) throw salesError;
  for (const table of ["meta_campaign_mappings", "tiktok_campaign_mappings"]) { const { error } = await admin.from(table).delete().eq("store_id", store.id); if (error && error.code !== "42P01") throw error; }
  const { error: notificationsError } = await admin.from("user_notifications").delete().eq("user_id", store.user_id).contains("metadata", { store_id: store.id }); if (notificationsError && notificationsError.code !== "42P01") throw notificationsError;
  const { error: costsError } = await admin.from("product_profit_costs").delete().eq("store_id", store.id); if (costsError && costsError.code !== "42P01") throw costsError;
 }
 const { error: credentialsError } = await admin.from("shopify_connections").delete().eq("store_id", store.id); if (credentialsError) throw credentialsError;
 const patch: Record<string, any> = { is_active: false, connection_status: redact ? "revoked" : "revoked" };
 if (redact) Object.assign(patch, { shop_domain: null, sales_last_synced_at: null, sales_last_sync_complete: false, sales_sync_error: null });
 const { error } = await admin.from("stores").update(patch).eq("id", store.id).eq("platform", "shopify"); if (error) throw error;
}
export async function POST(request: Request) {
 const len = Number(request.headers.get("content-length") ?? 0); if (len > MAX_BODY) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
 const raw = Buffer.from(await request.arrayBuffer()); if (raw.length > MAX_BODY) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
 if (!verifyShopifyWebhook(raw, request.headers.get("x-shopify-hmac-sha256"))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
 const shop = normalizeShopDomain(request.headers.get("x-shopify-shop-domain")), topic = (request.headers.get("x-shopify-topic") ?? "").toLowerCase();
 if (!shop) return NextResponse.json({ error: "Invalid shop" }, { status: 400 });
 const admin = createAdminClient(); let stores: any[];
 try { stores = await matchingStores(admin, shop); } catch { return NextResponse.json({ error: "Store lookup failed" }, { status: 503 }); }
 if (topic === "customers/data_request" || topic === "customers/redact") {
  let ids: string[];
  try { ids = requestedOrderIds(JSON.parse(raw.toString("utf8")), topic === "customers/redact" ? "orders_to_redact" : "orders_requested", shop); }
  catch { return NextResponse.json({ error: "Invalid privacy request" }, { status: 400 }); }
  try {
   if (topic === "customers/redact") {
    await redactRequestedShopifyOrders(admin, shop, ids);
    return NextResponse.json({ received: true });
   }
   const orders = await exportRequestedShopifyOrders(admin, stores, shop, ids);
   return NextResponse.json({ received: true, orders }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Customer privacy processing failed" }, { status: 503 }); }
 }
 if (topic === "shop/redact") { try { for (const store of stores) await cleanupStore(admin, store, true); } catch { return NextResponse.json({ error: "Shop data cleanup failed" }, { status: 503 }); } return NextResponse.json({ received: true }); }
 if (topic === "app/uninstalled") { try { for (const store of stores) await cleanupStore(admin, store, false); } catch { return NextResponse.json({ error: "Uninstall cleanup failed" }, { status: 503 }); } return NextResponse.json({ received: true }); }
 if (["orders/create", "orders/updated", "orders/cancelled", "orders/paid"].includes(topic)) {
  try { for (const store of stores) if (store.is_active && store.connection_status === "connected") await syncShopifyStore(store); } catch { return NextResponse.json({ error: "Synchronization failed" }, { status: 503 }); }
 }
 return NextResponse.json({ received: true });
}
