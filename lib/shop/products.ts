import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { ChariowMcpClient } from "@/lib/chariow/mcp-client";
import { normalizeChariowSnapshot } from "@/lib/chariow/analytics";
import { collectChariowPages } from "@/lib/chariow/pagination";
import { isProductId } from "./config";
import { clip, safeHttpsUrl, sanitizePlainText } from "./text";

// Données produit « publiques » : uniquement ce qui peut être affiché sur la vitrine.
// Aucune vente, aucun indicateur, aucun identifiant de connexion ne sort d'ici.
export type ShopProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number | string | null;
  currency: string | null;
  image: string | null;
  url: string | null;
};

// Lecture légère du catalogue Chariow (get_store + list_products seulement, contrairement à getChariowSnapshot
// qui appelle aussi les ventes et les analytics). Le stockage des identifiants reste côté serveur.
export async function fetchStoreProducts(storeId: string, descriptionLimit = 600): Promise<ShopProduct[]> {
  const safeDescriptionLimit = Number.isFinite(descriptionLimit) ? Math.max(0, Math.min(3_000, Math.floor(descriptionLimit))) : 600;
  const admin = createAdminClient();
  const { data: store } = await admin
    .from("stores")
    .select("mcp_url, access_token_encrypted, platform, is_active")
    .eq("id", storeId)
    .maybeSingle();
  if (!store || !store.is_active) throw new Error("Boutique indisponible");
  if (store.platform === "shopify") {
    const { getShopifyProductSnapshot } = await import("@/lib/shopify/client");
    const snapshot = await getShopifyProductSnapshot({ id: storeId } as any);
    if (!snapshot.coverage?.products?.complete) throw new Error(snapshot.coverage?.products?.reason ?? "Catalogue Shopify incomplet");
    return (snapshot.products?.data ?? []).flatMap((product: any) => {
      const rawId = String(product.id);
      const id = rawId.replace(/^gid:\/\/shopify\/Product\//, "");
      if (!isProductId(id)) return [];
      const name = clip(sanitizePlainText(String(product.title ?? product.name ?? "")), 120);
      if (!name) return [];
      const price = product.priceRangeV2?.minVariantPrice?.amount ?? product.price ?? null;
      const currency = product.priceRangeV2?.minVariantPrice?.currencyCode ?? product.currencyCode ?? product.currency ?? null;
      return [{ id, name, description: product.description ? clip(sanitizePlainText(String(product.description)), safeDescriptionLimit) || null : null, price,
        currency: currency ? String(currency).slice(0, 8) : null, image: safeHttpsUrl(product.featuredImage?.url ?? product.image), url: safeHttpsUrl(product.onlineStoreUrl) }];
    });
  }
  if (store.platform !== "chariow" || !store.mcp_url) throw new Error("Boutique indisponible");
  const accessToken = store.access_token_encrypted ? decryptSecret(store.access_token_encrypted) : undefined;
  const client = new ChariowMcpClient({ endpoint: store.mcp_url, accessToken });
  await client.initialize();
  const [storeInfo, products] = await Promise.all([client.callTool("get_store"), collectChariowPages((args) => client.callTool("list_products", args))]);
  if (!products.coverage.complete) throw new Error(products.coverage.reason ?? "Catalogue Chariow incomplet");
  const day = new Date().toISOString().slice(0, 10);
  const normalized = normalizeChariowSnapshot({ store: storeInfo, products: { data: products.data } }, { from: day, to: day });
  const result: ShopProduct[] = [];
  for (const product of normalized.products) {
    if (!isProductId(product.id)) continue;
    const name = clip(sanitizePlainText(product.name), 120);
    if (!name) continue;
    const description = product.description ? clip(sanitizePlainText(product.description), safeDescriptionLimit) : null;
    const price = typeof product.price === "string" ? clip(sanitizePlainText(product.price), 40) : product.price;
    result.push({
      id: product.id,
      name,
      description: description || null,
      price,
      currency: product.currency ? product.currency.slice(0, 8) : null,
      image: safeHttpsUrl(product.image),
      url: product.urlIsFallback ? null : safeHttpsUrl(product.url),
    });
  }
  return result;
}

// Cache 5 minutes par boutique : la page publique ne rappelle pas Chariow à chaque visite.
export function getCachedStoreProducts(storeId: string): Promise<ShopProduct[]> {
  return unstable_cache(() => fetchStoreProducts(storeId), ["shop-products", storeId], { revalidate: 300, tags: [`shop-products-${storeId}`] })();
}
