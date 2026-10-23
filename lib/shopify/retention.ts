import { createHash } from "node:crypto";

const RETENTION_DAYS = 90;
const MAX_MARKERS_PER_QUERY = 500;

export function retentionCutoff(now = new Date()): string {
  return new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function canonicalShopifyOrderId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^gid:\/\/shopify\/Order\/([1-9]\d*)$/.exec(value);
  return match && match[1].length <= 30 ? match[1] : null;
}

const idHash = (id: string) => createHash("sha256").update(id, "utf8").digest("hex");

/**
 * Fail-closed filter for new raw Shopify orders before persistence. Unknown or
 * invalid incoming dates are intentionally skipped; existing database rows are
 * aged by the retention RPC using occurred_at, then shopify_first_observed_at.
 */
export async function filterRetainedShopifySales(admin: any, storeId: string, sales: any[], now = new Date()): Promise<any[]> {
  if (!Array.isArray(sales)) throw new Error("Invalid Shopify sales batch");
  const { data: store, error: storeError } = await admin.from("stores").select("shop_domain").eq("id", storeId).eq("platform", "shopify").maybeSingle();
  if (storeError || typeof store?.shop_domain !== "string" || !store.shop_domain.trim()) throw new Error("Unable to establish Shopify retention scope");
  const cutoff = Date.parse(retentionCutoff(now));
  const candidates: Array<{ sale: any; hash: string }> = [];
  for (const sale of sales) {
    const id = canonicalShopifyOrderId(sale?.id);
    const occurred = typeof sale?.createdAt === "string" ? Date.parse(sale.createdAt) : NaN;
    if (!id || !Number.isFinite(occurred)) continue;
    if (occurred > cutoff) candidates.push({ sale, hash: idHash(id) });
  }
  const redacted = new Set<string>();
  const hashes = [...new Set(candidates.map(c => c.hash))];
  for (let offset = 0; offset < hashes.length; offset += MAX_MARKERS_PER_QUERY) {
    const batch = hashes.slice(offset, offset + MAX_MARKERS_PER_QUERY);
    const { data, error } = await admin.from("shopify_order_redactions").select("order_id_hash").eq("shop_domain", store.shop_domain).in("order_id_hash", batch);
    if (error || !Array.isArray(data)) throw new Error("Unable to verify Shopify order redactions");
    for (const marker of data) if (typeof marker.order_id_hash === "string") redacted.add(marker.order_id_hash);
  }
  return candidates.filter(c => !redacted.has(c.hash)).map(c => c.sale);
}
