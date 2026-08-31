import { decryptSecret } from "@/lib/crypto";
import { ChariowMcpClient } from "./mcp-client";
import type { ChariowNormalizedSnapshot, ChariowProduct, ChariowStoreSnapshot } from "./types";

export async function getChariowSnapshot(
  store: { mcp_url: string | null; access_token_encrypted: string | null },
  opts?: { from?: string; to?: string }
) {
  if (!store.mcp_url) throw new Error("Cette boutique n'a pas encore de connexion MCP active (mcp_url manquante)");
  const accessToken = store.access_token_encrypted ? decryptSecret(store.access_token_encrypted) : undefined;
  const client = new ChariowMcpClient({ endpoint: store.mcp_url || undefined, accessToken });
  await client.initialize();
  const now = new Date();
  const from = opts?.from ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = opts?.to ?? now.toISOString().slice(0, 10);
  const [storeInfo, products, sales, salesAnalytics, storeAnalytics] = await Promise.all([
    client.callTool("get_store"),
    client.callTool("list_products", { per_page: 100 }),
    client.callTool("list_sales", { per_page: 100, ...(opts?.from ? { start_date: from } : {}), ...(opts?.to ? { end_date: to } : {}) }),
    client.callTool("get_sales_analytics", { from, to }),
    client.callTool("get_store_analytics", { from, to }),
  ]);
  return { store: storeInfo, products, sales, salesAnalytics, storeAnalytics } satisfies ChariowStoreSnapshot;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  for (const key of ["data", "items", "products", "sales", "results"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | string | null {
  return typeof value === "number" || typeof value === "string" ? value : null;
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function formattedZero(currency: unknown): string {
  return `0 ${text(currency) ?? "XOF"}`;
}

export function normalizeChariowSnapshot(snapshot: ChariowStoreSnapshot, period: { from: string; to: string }): ChariowNormalizedSnapshot {
  const store = asRecord(snapshot.store);
  const storeAnalytics = asRecord(snapshot.storeAnalytics);
  const salesAnalytics = asRecord(snapshot.salesAnalytics);
  const analytics = { ...salesAnalytics, ...storeAnalytics };
  const sales = asRecord(storeAnalytics.sales ?? salesAnalytics.sales);
  const visits = asRecord(storeAnalytics.visits ?? salesAnalytics.visits);
  const customers = asRecord(storeAnalytics.customers ?? salesAnalytics.customers);
  const analyticsProducts = asRecord(storeAnalytics.products ?? salesAnalytics.products);
  const productRows = firstArray(snapshot.products);
  const products: ChariowProduct[] = productRows.map((item, index) => {
    const product = asRecord(item);
    const price = asRecord(product.price);
    return {
      id: String(product.id ?? product.uuid ?? index),
      name: text(product.name ?? product.title) ?? "Produit sans nom",
      description: text(product.description),
      price: numberValue(product.price) ?? numberValue(price.amount),
      currency: text(product.currency ?? price.currency),
      status: text(product.status ?? product.state),
       image: text(product.image ?? product.image_url ?? product.thumbnail),
       url: text(product.url ?? product.product_url ?? product.checkout_url ?? product.sales_url ?? product.link ?? product.slug),
      createdAt: text(product.created_at ?? product.createdAt),
      sales: typeof product.sales === "number" ? product.sales : null,
    };
  });
  const revenue = asRecord(sales.value);
  const currency = revenue.currency ?? sales.currency ?? store.currency;
  const revenueValue = numberValue(revenue.value ?? sales.value);
  const conversion = asRecord(visits.conversion_rate ?? visits.conversionRate);
  return {
    storeName: text(store.name ?? store.store_name) ?? "Boutique Chariow",
    storeStatus: text(store.status ?? store.connection_status) ?? "connected",
    products,
    sales: firstArray(snapshot.sales),
    kpis: {
      period,
      revenue: { value: revenueValue, formatted: text(revenue.formatted) ?? (numericValue(revenueValue) === 0 ? formattedZero(currency) : (revenueValue?.toString() ?? formattedZero(currency))) },
      sales: numericValue(sales.count) ?? 0,
      visits: numericValue(visits.total) ?? 0,
      conversionRate: text(conversion.formatted) ?? "0 %",
      customers: numericValue(customers.total) ?? 0,
      productsSold: numericValue(analyticsProducts.sold) ?? 0,
    },
  };
}

export function serializeChariowContext(snapshot: ChariowStoreSnapshot) {
  return JSON.stringify(snapshot, null, 2).slice(0, 40000);
}
