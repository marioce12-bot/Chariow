import { normalizeShopDomain } from "./auth";

/** Never coerce unsafe JSON numbers: Shopify IDs must retain their exact value. */
export function requestedOrderIds(payload: unknown, field: "orders_requested" | "orders_to_redact", shop: string): string[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid privacy payload");
  const body = payload as Record<string, unknown>;
  if (typeof body.shop_domain !== "string" || normalizeShopDomain(body.shop_domain) !== shop) throw new Error("Shop mismatch");
  const values = body[field];
  if (!Array.isArray(values) || values.length > 10_000) throw new Error("Invalid order list");
  const ids = values.map(value => {
    if (typeof value === "number" && (!Number.isSafeInteger(value) || value <= 0)) throw new Error("Unsafe order ID");
    const id = (typeof value === "string" || typeof value === "number") ? String(value).replace(/^gid:\/\/shopify\/Order\//, "") : "";
    if (!/^[1-9]\d*$/.test(id) || id.length > 30) throw new Error("Invalid order ID");
    return id;
  });
  return [...new Set(ids)];
}

export async function redactRequestedShopifyOrders(admin: any, shop: string, ids: string[]) {
  if (!ids.length) return;
  // A single database transaction records minimal denial markers and erases matching
  // orders. Its import trigger also closes the concurrent-sync race.
  const { error } = await admin.rpc("redact_shopify_orders", { p_shop_domain: shop, p_order_ids: ids });
  if (error) throw new Error("Shopify order redaction failed");
}

export async function exportRequestedShopifyOrders(admin: any, stores: Array<{ id: string; shop_domain: string; platform: string }>, shop: string, ids: string[]) {
  const orders: Record<string, unknown>[] = [];
  for (const store of stores) {
    if (store.platform !== "shopify" || store.shop_domain !== shop) continue;
    for (let offset = 0; offset < ids.length; offset += 100) {
      const keys = ids.slice(offset, offset + 100).map(id => `shopify:${store.id}:${id}`);
      // Explicit pagination avoids silently truncating an export at the API row cap.
      for (let start = 0; ; start += 100) {
        const { data, error } = await admin.from("chariow_sales")
          .select("chariow_sale_id,store_id,product_id,chariow_campaign_id,chariow_campaign_name,status,amount,net_amount,currency,settlement_done,event_type,occurred_at,updated_at,raw_payload")
          .eq("store_id", store.id).in("chariow_sale_id", keys)
          .order("chariow_sale_id", { ascending: true }).range(start, start + 99);
        if (error) throw new Error("Shopify order export failed");
        orders.push(...(data ?? []));
        if (!data || data.length < 100) break;
      }
    }
  }
  return orders;
}
