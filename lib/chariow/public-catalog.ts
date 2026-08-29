import { decryptSecret } from "@/lib/crypto";
import { ChariowMcpClient } from "./mcp-client";

export type PublicProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price: number | string | null;
  currency: string | null;
  type: string | null;
  image: string | null;
};

function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function rows(value: unknown) { const row = record(value); return Array.isArray(value) ? value : Array.isArray(row.data) ? row.data : Array.isArray(row.items) ? row.items : []; }
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function slug(value: unknown, fallback: string) { return (text(value) ?? fallback).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

export async function getPublicStoreProduct(store: { mcp_url: string | null; access_token_encrypted: string | null; store_name: string; slug: string }, productSlug: string) {
  if (!store.mcp_url) throw new Error("Boutique Chariow non connectée");
  const client = new ChariowMcpClient({ endpoint: store.mcp_url, accessToken: store.access_token_encrypted ? decryptSecret(store.access_token_encrypted) : undefined });
  await client.initialize();
  const result = await client.callTool("list_products", { per_page: 100 });
  const match = rows(result).map((item, index) => {
    const product = record(item);
    const id = String(product.id ?? product.uuid ?? "");
    return { id, slug: slug(product.slug ?? product.handle ?? product.name ?? product.title, id || `product-${index}`), name: text(product.name ?? product.title) ?? "Produit", description: text(product.description), price: typeof product.price === "number" || typeof product.price === "string" ? product.price : null, currency: text(product.currency ?? record(product.price).currency), type: text(product.type ?? product.product_type ?? product.category), image: text(product.image ?? product.image_url ?? product.thumbnail) } satisfies PublicProduct;
  }).find((product) => product.slug === productSlug);
  if (!match || !match.id) return null;
  return { store, product: match };
}
