import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopMessage, ShopProductDetail } from "@/components/shop/Storefront";
import { loadShop } from "@/lib/shop/data";
import { UNAVAILABLE_METADATA, buildShopMetadata } from "@/lib/shop/metadata";
import { pickTrackingParams, trackingQueryString } from "@/lib/shop/tracking";

type Props = { params: Promise<{ slug: string; produit: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, produit } = await params;
  const view = await loadShop(slug);
  if (view.state !== "ok") return UNAVAILABLE_METADATA;
  const item = view.items.find((candidate) => candidate.id === produit);
  return item ? buildShopMetadata(view, item) : UNAVAILABLE_METADATA;
}

export default async function ShopProductPage({ params, searchParams }: Props) {
  const { slug, produit } = await params;
  const view = await loadShop(slug);
  if (view.state === "limited") return <ShopMessage title="Trop de visites" text="Merci de réessayer dans une minute." />;
  if (view.state !== "ok") notFound();
  const item = view.items.find((candidate) => candidate.id === produit);
  if (!item) notFound();
  return <ShopProductDetail view={view} item={item} query={trackingQueryString(pickTrackingParams(await searchParams))} />;
}
