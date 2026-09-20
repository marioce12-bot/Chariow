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

// L'API Chariow enveloppe ses réponses ({ message, data, errors }). Pour la boutique
// (get_store), l'objet utile est donc dans `data` : sans ce déballage, ni le nom, ni
// l'URL de la boutique (nécessaire pour construire le lien produit) n'étaient lus.
function unwrapData(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  const inner = record.data;
  return inner && typeof inner === "object" && !Array.isArray(inner) ? inner as Record<string, unknown> : record;
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
// Chariow documente `url` sur la boutique (domaine personnalisé ou sous-domaine) :
// on le lit en premier, avant les anciens noms de champ.
function buildProductUrl(store: Record<string, unknown>, product: Record<string, unknown>): string | null {
  const slug = firstText(product.slug, product.handle, product.reference);
  if (!slug) return null;
  const storeDomain = firstText(store.url, asRecord(product.store).url, store.storefront_url, store.domain, store.subdomain, store.slug, store.store_slug);
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
  const store = unwrapData(snapshot.store);
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
    // Dans `pricing`, chaque montant est un objet { value, formatted, short, currency }.
    const currentPrice = asRecord(pricingEntry.current_price);
    const effectivePrice = asRecord(pricingEntry.effective);
    const basePrice = asRecord(pricingEntry.price);
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
      currentPrice.value,
      effectivePrice.value,
      basePrice.value,
      currentPrice.formatted,
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

    // Chariow renvoie les visuels dans `pictures` : { thumbnail, cover } (URL ou null).
    // thumbnail = image carrée de la liste produits ; cover = bannière. On préfère le thumbnail.
    const pictures = asRecord(product.pictures);
    const resolvedImage = firstText(
      pictures.thumbnail,
      pictures.cover,
      product.image,
      product.image_url,
      product.thumbnail,
      product.thumbnail_url,
      product.cover,
      product.cover_url
    );
    if (index < 2 && !resolvedImage) {
      console.warn("[chariow] image produit non résolue — clés produit:", Object.keys(product), "clés pictures:", Object.keys(pictures));
    }

    // Diagnostic ponctuel : si on n'arrive toujours pas à lire le prix ou le lien
    // sur les deux premiers produits, on log les clés brutes renvoyées par
    // Chariow (jamais les valeurs, pour éviter de fuiter des données client) —
    // ça permet de repérer le vrai nom de champ dans les logs serveur au
    // prochain sync plutôt que de deviner à l'aveugle.
    if (!loggedUnresolvedFields && index < 2 && (resolvedPrice === null || !resolvedUrl)) {
      console.warn(
        "[chariow] champ prix/lien non résolu pour un produit — prix résolu:",
        resolvedPrice !== null,
        "lien résolu:",
        Boolean(resolvedUrl),
        "clés boutique (get_store):",
        Object.keys(store),
        "clés produit:",
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
      // La devise d'un produit Chariow se trouve dans ses montants `pricing`
      // (ex. pricing.current_price.currency), pas sur le produit lui-même.
      currency: firstText(product.currency, price.currency, price.currency_code, product.currency_code, currentPrice.currency, effectivePrice.currency, basePrice.currency, pricingEntry.currency, pricingEntry.currency_code, store.currency),
      status: text(product.status ?? product.state),
      image: resolvedImage,
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

// Identifiant lisible : accepte aussi les identifiants numériques (firstText les ignore).
function idText(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }
  return null;
}

// Montant d'une vente : Chariow renvoie soit un nombre, soit { value, currency }.
function saleAmountValue(value: unknown): number {
  const row = asRecord(value);
  return numericValue(row.value ?? value) ?? 0;
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatMoney(value: number, currency: string): string {
  return `${Math.round(value).toLocaleString("fr-FR")} ${currency}`;
}

type ProductStat = { count: number; revenue: number };

function bumpStat(map: Map<string, ProductStat>, key: string, amount: number) {
  const current = map.get(key) ?? { count: 0, revenue: 0 };
  current.count += 1;
  current.revenue += amount;
  map.set(key, current);
}

// Contexte envoyé à l'IA du chat.
// Avant : on envoyait le JSON brut de Chariow (store + liste produits complète avec
// descriptions/images, etc.). Ce JSON est ensuite tronqué à 6 000 caractères dans
// /api/chat : l'IA ne voyait donc que le début (infos boutique, nombre de clients…)
// et jamais les produits ni les ventes.
// Maintenant : un résumé compact et structuré (KPIs, classement produits avec
// ventes + chiffre d'affaires, dernières ventes) qui tient largement dans la limite.
export function serializeChariowContext(snapshot: ChariowStoreSnapshot) {
  const now = new Date();
  const period = {
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
  const normalized = normalizeChariowSnapshot(snapshot, period);
  const store = unwrapData(snapshot.store);
  const rawSales = firstArray(snapshot.sales).map((item) => asRecord(item));
  const defaultCurrency = firstText(store.currency, normalized.products.find((product) => product.currency)?.currency) ?? "XOF";

  const byId = new Map<string, ProductStat>();
  const byName = new Map<string, ProductStat>();
  let confirmedCount = 0;
  for (const sale of rawSales) {
    if (!isConfirmedSale(sale)) continue;
    confirmedCount += 1;
    const saleProduct = asRecord(sale.product);
    const amount = saleAmountValue(sale.amount);
    const productId = idText(sale.product_id, saleProduct.id, saleProduct.uuid);
    if (productId) {
      bumpStat(byId, productId, amount);
      continue;
    }
    const productName = firstText(sale.product_name, saleProduct.name, saleProduct.title);
    if (productName) bumpStat(byName, productName, amount);
  }

  const nameById = new Map(normalized.products.map((product) => [product.id, product.name] as const));

  const ranked = normalized.products
    .map((product) => {
      const stat = byId.get(product.id) ?? byName.get(product.name);
      return { product, count: stat?.count ?? 0, revenue: stat?.revenue ?? 0 };
    })
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue);

  const kpis = normalized.kpis;
  const lines: string[] = [];
  lines.push(`Boutique : ${normalized.storeName} (statut : ${normalized.storeStatus})`);
  lines.push(`Période des indicateurs : ${period.from} → ${period.to}`);
  lines.push(`Chiffre d'affaires : ${kpis.revenue.formatted ?? "n/d"}`);
  lines.push(`Ventes : ${kpis.sales} | Visites : ${kpis.visits} | Taux de conversion : ${kpis.conversionRate} | Clients : ${kpis.customers} | Produits vendus : ${kpis.productsSold}`);
  lines.push(`Catalogue : ${normalized.products.length} produit(s)`);

  if (!ranked.length) {
    lines.push("Aucun produit n'a été récupéré dans le catalogue.");
  } else {
    lines.push(`Classement des produits par ventes confirmées (calculé sur les ${rawSales.length} dernières ventes récupérées, dont ${confirmedCount} confirmées ; le chiffre d'affaires par produit correspond à ces mêmes ventes) :`);
    const TOP_PRODUCTS = 12;
    ranked.slice(0, TOP_PRODUCTS).forEach(({ product, count, revenue }, index) => {
      const currency = product.currency ?? defaultCurrency;
      const price = product.price !== null && product.price !== "" ? `${product.price} ${currency}` : "prix n/d";
      lines.push(`${index + 1}. ${clip(product.name, 60)} — ${count} vente(s) — CA ${formatMoney(revenue, currency)} — prix ${price} — statut ${product.status ?? "n/d"}`);
    });
    if (ranked.length > TOP_PRODUCTS) {
      lines.push(`(+ ${ranked.length - TOP_PRODUCTS} autre(s) produit(s) moins vendus, non détaillés)`);
    }
  }

  const recent = rawSales
    .slice()
    .sort((a, b) => String(b.created_at ?? b.createdAt ?? "").localeCompare(String(a.created_at ?? a.createdAt ?? "")))
    .slice(0, 8);
  if (recent.length) {
    lines.push("Ventes récentes :");
    for (const sale of recent) {
      const saleProduct = asRecord(sale.product);
      const productId = idText(sale.product_id, saleProduct.id, saleProduct.uuid);
      const productName = firstText(sale.product_name, saleProduct.name, saleProduct.title) ?? (productId ? nameById.get(productId) : undefined) ?? "produit inconnu";
      const currency = firstText(asRecord(sale.amount).currency, sale.currency) ?? defaultCurrency;
      const date = String(sale.created_at ?? sale.createdAt ?? "").slice(0, 10) || "date n/d";
      lines.push(`- ${date} | ${clip(productName, 50)} | ${formatMoney(saleAmountValue(sale.amount), currency)} | ${text(sale.status ?? sale.state) ?? "n/d"}`);
    }
  } else {
    lines.push("Aucune vente récente récupérée.");
  }

  return lines.join("\n").slice(0, 4000);
}
