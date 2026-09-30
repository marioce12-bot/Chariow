import type { Metadata } from "next";
import { getAppUrl, type ShopItem, type ShopOk } from "./data";
import { clip } from "./text";

export const UNAVAILABLE_METADATA: Metadata = { title: "Boutique indisponible", robots: { index: false, follow: false } };

export function buildShopMetadata(view: ShopOk, item?: ShopItem): Metadata {
  const { config } = view;
  const path = item ? `/shop/${view.slug}/${item.id}` : `/shop/${view.slug}`;
  const title = item ? `${item.title} — ${config.shopName}` : config.shopName;
  const description = clip(item?.description || config.tagline || config.about || `Découvre les produits de ${config.shopName}`, 200);
  const image = item?.image ?? config.logoUrl ?? view.items[0]?.image ?? undefined;
  return {
    metadataBase: new URL(getAppUrl()),
    title,
    description,
    alternates: { canonical: path },
    // noindex tant que la vitrine n'est pas publiée (aperçu privé du propriétaire).
    robots: view.preview ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: { type: "website", title, description, url: path, siteName: config.shopName, locale: "fr_FR", images: image ? [{ url: image }] : undefined },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, images: image ? [image] : undefined },
  };
}
