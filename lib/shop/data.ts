import { cache } from "react";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCachedStoreProducts } from "./products";
import { isSubscriptionActive, type SubscriptionRow } from "./subscription";
import { isValidSlug } from "./slug";
import { clientIp, rateLimit } from "./rate-limit";
import { formatPrice } from "./text";
import { parseBuyUrl, validateShopConfig, type ShopConfig } from "./config";

export type ShopItem = { id: string; title: string; description: string | null; price: string | null; image: string | null };
export type ShopOk = {
  state: "ok";
  preview: boolean;
  storefrontId: string;
  slug: string;
  config: ShopConfig;
  items: ShopItem[];
  productsError: boolean;
  pixelId: string | null;
};
export type ShopView = ShopOk | { state: "unavailable" } | { state: "limited" };

type StorefrontRecord = {
  id: string;
  user_id: string;
  store_id: string;
  slug: string;
  config: unknown;
  is_published: boolean;
  is_disabled_by_admin: boolean;
};

export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://vendeo-studio.site").replace(/\/$/, "");
}

function validate(config: unknown) {
  return validateShopConfig(config, { cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? null });
}

// Une vitrine n'est lisible que si : elle existe, n'est pas désactivée par l'admin et l'abonnement du propriétaire est valide.
async function readStorefront(slug: string): Promise<StorefrontRecord | null> {
  if (!isValidSlug(slug)) return null;
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("shop_storefronts")
    .select("id, user_id, store_id, slug, config, is_published, is_disabled_by_admin")
    .eq("slug", slug)
    .maybeSingle();
  if (!row || row.is_disabled_by_admin) return null;
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("status, trial_active, trial_ends_at, current_period_end")
    .eq("user_id", row.user_id)
    .maybeSingle();
  if (!isSubscriptionActive(subscription as SubscriptionRow)) return null;
  return row as StorefrontRecord;
}

async function isOwnerViewing(ownerId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id === ownerId;
  } catch {
    return false;
  }
}

// Pixel Meta du propriétaire : pixel le plus récemment actif du compte publicitaire sélectionné.
async function ownerPixelId(userId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data: accounts } = await admin
      .from("meta_ad_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("is_selected", true)
      .order("created_at", { ascending: false })
      .limit(1);
    const accountId = accounts?.[0]?.id;
    if (!accountId) return null;
    const { data: pixels } = await admin
      .from("meta_pixels")
      .select("pixel_id")
      .eq("user_id", userId)
      .eq("ad_account_id", accountId)
      .order("last_fired_at", { ascending: false, nullsFirst: false })
      .limit(1);
    const pixel = pixels?.[0]?.pixel_id;
    return typeof pixel === "string" && /^\d{5,20}$/.test(pixel) ? pixel : null;
  } catch {
    return null;
  }
}

// Chargé une seule fois par requête (generateMetadata + page partagent le résultat).
export const loadShop = cache(async (slug: string): Promise<ShopView> => {
  const h = await headers();
  if (rateLimit(`shop-page:${clientIp(h)}`, 120)) return { state: "limited" };
  const row = await readStorefront(slug);
  if (!row) return { state: "unavailable" };
  let preview = false;
  if (!row.is_published) {
    // Non publiée : hors ligne pour tout le monde sauf un aperçu privé pour son propriétaire connecté.
    if (!(await isOwnerViewing(row.user_id))) return { state: "unavailable" };
    preview = true;
  }
  const parsed = validate(row.config);
  if (!parsed.ok) return { state: "unavailable" };
  const config = parsed.config;

  let catalog: Awaited<ReturnType<typeof getCachedStoreProducts>> = [];
  let productsError = false;
  try {
    catalog = await getCachedStoreProducts(row.store_id);
  } catch (error) {
    productsError = true;
    console.error("shop products unavailable", error instanceof Error ? error.message : error);
  }
  const byId = new Map(catalog.map((product) => [product.id, product] as const));
  const items: ShopItem[] = [];
  for (const entry of config.products) {
    if (!entry.visible) continue;
    const product = byId.get(entry.productId);
    if (!product) continue;
    items.push({
      id: product.id,
      title: entry.title ?? product.name,
      description: entry.description ?? product.description,
      price: formatPrice(product.price, product.currency),
      image: product.image,
    });
  }
  const pixelId = preview ? null : await ownerPixelId(row.user_id);
  return { state: "ok", preview, storefrontId: row.id, slug: row.slug, config, items, productsError, pixelId };
});

// Cible d'un clic « Acheter » : uniquement pour une vitrine publiée, produit visible, lien re-validé (https + domaine autorisé).
export async function resolveBuyTarget(slug: string, productId: string): Promise<{ storefrontId: string; url: string } | null> {
  const row = await readStorefront(slug);
  if (!row || !row.is_published) return null;
  const parsed = validate(row.config);
  if (!parsed.ok) return null;
  const entry = parsed.config.products.find((product) => product.visible && product.productId === productId);
  if (!entry) return null;
  const url = parseBuyUrl(entry.buyUrl);
  return url ? { storefrontId: row.id, url } : null;
}

// Vitrine publiée (pour l'enregistrement des visites).
export async function findPublishedStorefrontId(slug: string): Promise<string | null> {
  const row = await readStorefront(slug);
  return row && row.is_published ? row.id : null;
}
