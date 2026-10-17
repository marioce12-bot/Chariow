type ProductRecord = Record<string, unknown>;
function record(value: unknown): ProductRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as ProductRecord : {}; }
export function safePublicHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try { const url = new URL(value.trim()); return url.protocol === "https:" && url.hostname && !url.username && !url.password ? url.toString() : null; }
  catch { return null; }
}
/** Current Chariow storefronts publish /prd_PUBLIC_ID even when the API slug is null.
 * This route and /prd_PUBLIC_ID/checkout are linked by the public storefront itself.
 * Never interprets arbitrary references or a product name as a URL path.
 */
export function resolveChariowProductUrl(value: unknown): string | null {
  const product = record(value);
  for (const key of ["url","product_url","public_url","storefront_url","page_url","permalink","share_url","landing_url","checkout_url","sales_url","link"]) {
    const candidate = product[key];
    const nested = record(candidate);
    const url = safePublicHttpsUrl(candidate) ?? safePublicHttpsUrl(nested.url) ?? safePublicHttpsUrl(nested.href);
    if (url) return url;
  }
  if (product.status !== "published" || typeof product.id !== "string" || !/^prd_[a-z0-9]+$/i.test(product.id)) return null;
  const storeUrl = safePublicHttpsUrl(record(product.store).url);
  if (!storeUrl) return null;
  const base = new URL(storeUrl);
  // Only the store origin is used; queries/fragments/paths never become product routes.
  return new URL(`/${product.id}`, base.origin).toString();
}
