import type { SupabaseClient } from "@supabase/supabase-js";
import { FORWARDED_PARAMS, type TrackingParams } from "./tracking";

export async function recordShopEvent(
  admin: SupabaseClient,
  event: { storefrontId: string; type: "visit" | "buy_click"; productId?: string | null; visitorId?: string | null; params: TrackingParams },
) {
  const row: Record<string, unknown> = {
    storefront_id: event.storefrontId,
    event_type: event.type,
    product_id: event.productId ?? null,
    visitor_id: event.visitorId ?? null,
  };
  for (const key of FORWARDED_PARAMS) row[key] = event.params[key] ?? null;
  const { error } = await admin.from("shop_storefront_events").insert(row);
  if (error) console.error("shop event insert failed", error.message);
}
