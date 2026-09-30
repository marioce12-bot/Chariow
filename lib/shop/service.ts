import type { SupabaseClient } from "@supabase/supabase-js";
import { validateShopConfig, type ShopConfig } from "./config";
import { fetchStoreProducts, type ShopProduct } from "./products";
import { buildSlugCandidates, isValidSlug } from "./slug";

export type StorefrontRow = {
  id: string;
  user_id: string;
  store_id: string;
  slug: string;
  config: unknown;
  is_published: boolean;
  is_disabled_by_admin: boolean;
  created_at: string;
  updated_at: string;
};

export const STOREFRONT_COLUMNS = "id, user_id, store_id, slug, config, is_published, is_disabled_by_admin, created_at, updated_at";

export type SaveResult = { ok: true; storefront: StorefrontRow; created: boolean } | { ok: false; status: number; error: string };

export function storefrontUrl(slug: string): string {
  return `${(process.env.NEXT_PUBLIC_APP_URL || "https://vendeo-studio.site").replace(/\/$/, "")}/shop/${slug}`;
}

export function validateConfigForServer(config: unknown) {
  return validateShopConfig(config, { cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? null });
}

// Crée ou met à jour la vitrine d'une boutique. Utilisé par l'API et par l'agent IA (balise [[CREE_VITRINE]]).
// `supabase` est le client de l'utilisateur : les politiques RLS s'appliquent.
export async function saveStorefront(args: {
  supabase: SupabaseClient;
  userId: string;
  storeId: string;
  config: unknown;
  publish?: boolean;
  preferredSlug?: string;
  catalog?: ShopProduct[];
}): Promise<SaveResult> {
  const parsed = validateConfigForServer(args.config);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.errors.slice(0, 5).join(" ; ") };
  const config: ShopConfig = parsed.config;

  const { data: store } = await args.supabase.from("stores").select("id, platform, is_active").eq("id", args.storeId).eq("user_id", args.userId).maybeSingle();
  if (!store) return { ok: false, status: 404, error: "Boutique introuvable" };
  if (store.platform !== "chariow" || !store.is_active) return { ok: false, status: 400, error: "Seules les boutiques Chariow actives sont prises en charge" };

  let catalog = args.catalog;
  if (!catalog) {
    try {
      catalog = await fetchStoreProducts(args.storeId);
    } catch {
      return { ok: false, status: 502, error: "Impossible de vérifier les produits de la boutique pour le moment" };
    }
  }
  const known = new Set(catalog.map((product) => product.id));
  const unknown = config.products.filter((product) => !known.has(product.productId)).map((product) => product.productId);
  if (unknown.length) return { ok: false, status: 400, error: `Produit(s) introuvable(s) dans la boutique : ${unknown.slice(0, 3).join(", ")}` };
  if (args.publish && !config.products.some((product) => product.visible)) return { ok: false, status: 400, error: "Affiche au moins un produit avant de publier" };

  const { data: existing } = await args.supabase.from("shop_storefronts").select("id").eq("store_id", args.storeId).eq("user_id", args.userId).maybeSingle();
  if (existing) {
    const patch: Record<string, unknown> = { config };
    if (args.publish !== undefined) patch.is_published = args.publish;
    const { data, error } = await args.supabase.from("shop_storefronts").update(patch).eq("id", existing.id).eq("user_id", args.userId).select(STOREFRONT_COLUMNS).single();
    if (error || !data) return { ok: false, status: 500, error: "Impossible de mettre à jour la vitrine" };
    return { ok: true, storefront: data as StorefrontRow, created: false };
  }

  if (args.preferredSlug !== undefined && !isValidSlug(args.preferredSlug)) return { ok: false, status: 400, error: "Lien invalide : 3 à 60 caractères, lettres minuscules, chiffres et tirets" };
  const candidates = args.preferredSlug ? [args.preferredSlug] : buildSlugCandidates(config.shopName);
  for (const slug of candidates) {
    const { data, error } = await args.supabase
      .from("shop_storefronts")
      .insert({ user_id: args.userId, store_id: args.storeId, slug, config, is_published: Boolean(args.publish) })
      .select(STOREFRONT_COLUMNS)
      .single();
    if (!error && data) return { ok: true, storefront: data as StorefrontRow, created: true };
    if (error?.code === "23505") {
      if (`${error.message} ${error.details ?? ""}`.includes("store_unique")) return { ok: false, status: 409, error: "Cette boutique a déjà une vitrine" };
      if (args.preferredSlug) return { ok: false, status: 409, error: "Ce lien est déjà pris" };
      continue; // slug déjà utilisé : candidat suivant (suffixe aléatoire)
    }
    console.error("shop storefront insert failed", error?.message);
    return { ok: false, status: 500, error: "Impossible de créer la vitrine" };
  }
  return { ok: false, status: 409, error: "Impossible de trouver un lien libre, choisis-en un autre" };
}

export async function setStorefrontPublished(supabase: SupabaseClient, userId: string, id: string, publish: boolean): Promise<SaveResult> {
  const { data: row } = await supabase.from("shop_storefronts").select(STOREFRONT_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
  if (!row) return { ok: false, status: 404, error: "Vitrine introuvable" };
  if (publish) {
    const parsed = validateConfigForServer((row as StorefrontRow).config);
    if (!parsed.ok) return { ok: false, status: 400, error: "La configuration de la vitrine est invalide" };
    if (!parsed.config.products.some((product) => product.visible)) return { ok: false, status: 400, error: "Affiche au moins un produit avant de publier" };
  }
  const { data, error } = await supabase.from("shop_storefronts").update({ is_published: publish }).eq("id", id).eq("user_id", userId).select(STOREFRONT_COLUMNS).single();
  if (error || !data) return { ok: false, status: 500, error: "Impossible de modifier la vitrine" };
  return { ok: true, storefront: data as StorefrontRow, created: false };
}
