import { createAdminClient } from "@/lib/supabase/admin";
import { getShopifySnapshot } from "./client";
import { filterRetainedShopifySales } from "./retention";

/** All order-consuming contexts must honor erasure, including AI prompts. */
export async function getPrivateShopifySnapshot(store: { id: string; [key: string]: unknown }, options: { from?: string; to?: string } = {}) {
  const snapshot = await getShopifySnapshot(store, options);
  const sales = await filterRetainedShopifySales(createAdminClient(), store.id, snapshot.sales.data);
  return { ...snapshot, sales: { ...snapshot.sales, data: sales } };
}
