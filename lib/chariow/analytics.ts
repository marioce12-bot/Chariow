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

function firstNumeric(...candidates: unknown[]): number | string | null {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim()) {
      // Certaines API renvoient un prix déjà formaté avec la devise, ex. "8 $US"
      // ou "12 500 XOF" : on extrait la partie numérique plutôt que d'abandonner.
      const cleaned = candidate.replace(/[^\d.,-]/g, "").replace(/\s/g, "");
      if (cleaned && Number.isFinite(Number(cleaned.replace(",", ".")))) return Number(cleaned.replace(",", "."));
      if (Number.isFinite(Number(candidate))) return candidate;
    }
  }
  return null;
}

function firstText(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const value = text(candidate);
    if (value) return value;
  }
  return null;
}

// Construit un lien produit à partir d'une boutique + d'un slug quand l'API ne
// renvoie pas d'URL complète toute faite (seulement un identifiant/slug produit).
function buildProductUrl(store: Record<string, unknown>, product: Record<string, unknown>): string | null {
  const slug = firstText(product.slug, product.handle, product.reference);
  if (!slug) return null;
  const storeDomain = firstText(store.domain, store.subdomain, store.slug, store.store_slug, store.url, store.storefront_url);
  if (!storeDomain) return null;
  const host = storeDomain.includes(".") ? storeDomain.replace(/^https?:\/\//, "") : `${storeDomain}.mychariow.com`;
  return `https://${host.replace(/\/$/, "")}/${slug.replace(/^\//, "")}`;
}

// Une vente est considérée comme confirmée (encaissée) si Chariow lui donne un
// statut "completed" ou "settled" — mêmes statuts que ceux déjà utilisés pour
// les KPIs de la page "Ventes" (Dashboard.tsx). Les paiements en attente,
// échoués, abandonnés ou remboursés ne comptent pas.
function isConfirmedSale(sale: Record<string, unknown>): boolean {
  const status = text(sale.status ?? sale.state);
  return status === "completed" || status === "settled";
}

// Chariow ne renvoie pas de compteur de ventes fiable directement sur chaque
// produit via list_products (le champ `sales` y est presque toujours absent ou
// null) : c'est ce qui affichait "0 vente" devant chaque produit alors que les
// ventes totales (get_sales_analytics) étaient correctes. On calcule donc
// nous-mêmes le nombre de ventes confirmées par produit à partir de la liste
// brute des ventes (list_sales), en les regroupant par identifiant produit —
// avec un repli sur le nom du produit si Chariow ne fournit pas d'identifiant
// sur la vente.
function buildProductSalesIndex(rawSales: Record<string, unknown>[]): { byId: Map<string, number>; byName: Map<string, number> } {
  const byId = new Map<string, number>();
  const byName = new Map<string, number>();
  for (const sale of rawSales) {
    if (!isConfirmedSale(sale)) continue;
    const saleProduct = asRecord(sale.product);
    const productId = firstText(sale.product_id, saleProduct.id, saleProduct.uuid);
    if (productId) {
      byId.set(productId, (byId.get(productId) ?? 0) + 1);
      continue;
    }
    const productName = firstText(sale.product_name, saleProduct.name, saleProduct.title);
    if (productName) {
      byName.set(productName, (byName.get(productName) ?? 0) + 1);
    }
  }
  return { byId, byName };
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
  const rawSales = firstArray(snapshot.sales).map((item) => asRecord(item));
  const productSalesIndex = buildProductSalesIndex(rawSales);
  let loggedUnresolvedFields = false;
  const products: ChariowProduct[] = productRows.map((item, index) => {
    const product = asRecord(item);
    const price = asRecord(product.price);
    // Chariow expose le prix via un champ `pricing` (objet, ou tableau de
    // formules de prix) plutôt que `price` sur certains produits — on lit
    // les deux pour ne rater ni l'un ni l'autre.
    const pricingRaw = product.pricing;
    const pricingEntry = asRecord(Array.isArray(pricingRaw) ? pricingRaw[0] : pricingRaw);
    const resolvedPrice = firstNumeric(
      product.price,
      price.value,
      price.amount,
      price.price,
      product.selling_price,
      product.unit_price,
      product.amount,
      product.cost,
      product.formatted_price,
      product.price_formatted,
      pricingEntry.amount,
      pricingEntry.price,
      pricingEntry.value,
      pricingEntry.unit_price,
      pricingRaw
    );
    const resolvedUrl = firstText(
      product.url,
      product.product_url,
      product.public_url,
      product.storefront_url,
      product.store_url,
      product.page_url,
      product.short_url,
      product.permalink,
      product.share_url,
      product.landing_url,
      product.checkout_url,
      product.sales_url,
      product.link
    ) ?? buildProductUrl(store, product);

    // Diagnostic ponctuel : si on n'arrive toujours pas à lire le prix ou le lien
    // sur les deux premiers produits, on log les clés brutes renvoyées par
    // Chariow (jamais les valeurs, pour éviter de fuiter des données client) —
    // ça permet de repérer le vrai nom de champ dans les logs serveur au
    // prochain sync plutôt que de deviner à l'aveugle.
    if (!loggedUnresolvedFields && index < 2 && (resolvedPrice === null || !resolvedUrl)) {
      console.warn(
        "[chariow] champ prix/lien non résolu pour un produit — clés disponibles:",
        Object.keys(product),
        "clés price:",
        Object.keys(price),
        "pricing est un tableau:",
        Array.isArray(pricingRaw),
        "clés pricing:",
        Object.keys(pricingEntry)
      );
      loggedUnresolvedFields = true;
    }

    const productId = String(product.id ?? product.uuid ?? index);
    const productName = text(product.name ?? product.title) ?? "Produit sans nom";
    // On calcule le nombre réel de ventes confirmées pour ce produit à partir
    // de la liste brute des ventes Chariow (voir buildProductSalesIndex
    // ci-dessus), plutôt que de faire confiance à un champ `sales` sur le
    // produit qui n'est presque jamais fourni par l'API Chariow.
    const computedSales = productSalesIndex.byId.get(productId) ?? productSalesIndex.byName.get(productName) ?? null;
    const fallbackSales = typeof product.sales === "number" ? product.sales : null;

    return {
      id: productId,
      name: productName,
      description: text(product.description),
      price: resolvedPrice,
      currency: firstText(product.currency, price.currency, price.currency_code, product.currency_code, pricingEntry.currency, pricingEntry.currency_code, store.currency),
      status: text(product.status ?? product.state),
      image: text(product.image ?? product.image_url ?? product.thumbnail),
      url: resolvedUrl,
      createdAt: text(product.created_at ?? product.createdAt),
      sales: computedSales ?? fallbackSales ?? 0,
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
