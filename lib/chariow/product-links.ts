import { resolveChariowProductUrl } from "./product-urls";
import { decryptSecret } from "@/lib/crypto";
import { ChariowMcpClient } from "./mcp-client";

export type RecoveryLinkProduct = {
  id: string;
  name: string;
  url: string | null;
  urlIsFallback?: boolean;
};

/** Fetch only the product catalog, following Chariow cursor pagination (no analytics/sales calls). */
export async function loadRecoveryProducts(store: {
  mcp_url: string | null;
  access_token_encrypted: string | null;
}): Promise<RecoveryLinkProduct[]> {
  if (!store.mcp_url) return [];
  const client = new ChariowMcpClient({
    endpoint: store.mcp_url,
    accessToken: store.access_token_encrypted ? decryptSecret(store.access_token_encrypted) : undefined,
  });
  await client.initialize();
  const rows: unknown[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const result = await client.callTool("list_products", { per_page: 100, ...(cursor ? {cursor} : {}) });
    const source = record(result);
    const batch = Array.isArray(result) ? result : [source.data, source.items, source.products, source.results].find(Array.isArray) as unknown[] | undefined ?? [];
    rows.push(...batch);
    const pagination = record(source.pagination);
    const next = pagination.next_cursor;
    if (pagination.has_more_pages === false || typeof next !== "string" || !next) break;
    if (seen.has(next) || page === 19) throw new Error("Catalogue Chariow incomplet : pagination à vérifier");
    seen.add(next);
    cursor = next;
  }
  return rows.map((value) => {
    const product = record(value);
    const id = product.id ?? product.uuid;
    return {
      id: typeof id === "string" || typeof id === "number" ? String(id) : "",
      name: typeof (product.name ?? product.title) === "string" ? String(product.name ?? product.title) : "",
      url: resolveChariowProductUrl(product),
      // Published Chariow public-ID routes are used, never arbitrary references or home-page fallbacks.
      urlIsFallback: false,
    };
  }).filter((product) => product.id);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function validHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function candidateUrls(source: unknown, keys: string[]): string[] {
  const row = record(source);
  return keys.flatMap((key) => {
    const value = row[key];
    if (typeof value === "string") return [value];
    const nested = record(value);
    return [nested.url, nested.href].filter((v): v is string => typeof v === "string");
  });
}

function firstValid(...sources: Array<{ value: unknown; keys: string[] }>): string | null {
  for (const source of sources) {
    for (const candidate of candidateUrls(source.value, source.keys)) {
      const url = validHttpsUrl(candidate);
      if (url) return url;
    }
  }
  return null;
}

/**
 * Resolve a recovery destination from the sale's explicit payment/checkout URL,
 * or from the normalized catalog product linked by an exact product ID.
 * Never derives URLs from IDs, names, references, or storefront home fallbacks.
 */
export function getRecoveryPaymentUrl(
  rawSale: unknown,
  products: RecoveryLinkProduct[] = []
): string | null {
  const sale = record(rawSale);
  const payment = record(sale.payment);
  const checkout = record(sale.checkout);
  const links = record(sale.links);
  const explicitUrl = firstValid(
    { value: sale, keys: ["payment_url", "checkout_url", "payment_link", "checkout_link"] },
    { value: payment, keys: ["url", "payment_url", "checkout_url", "link"] },
    { value: checkout, keys: ["url", "payment_url", "checkout_url", "link"] },
    { value: links, keys: ["payment_url", "checkout_url", "payment", "checkout"] }
  );
  if (explicitUrl) return explicitUrl;

  const rawProduct = record(sale.product);
  const rawId = sale.product_id ?? rawProduct.id ?? rawProduct.uuid;
  if (typeof rawId !== "string" && typeof rawId !== "number") return null;
  const product = products.find((entry) => entry.id === String(rawId));
  if (!product || product.urlIsFallback) return null;
  return validHttpsUrl(product.url);
}
