import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopMessage, ShopStorefront } from "@/components/shop/Storefront";
import { loadShop } from "@/lib/shop/data";
import { UNAVAILABLE_METADATA, buildShopMetadata } from "@/lib/shop/metadata";
import { pickTrackingParams, trackingQueryString } from "@/lib/shop/tracking";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const view = await loadShop(slug);
  return view.state === "ok" ? buildShopMetadata(view) : UNAVAILABLE_METADATA;
}

export default async function ShopPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const view = await loadShop(slug);
  if (view.state === "limited") return <ShopMessage title="Trop de visites" text="Merci de réessayer dans une minute." />;
  if (view.state !== "ok") notFound();
  return <ShopStorefront view={view} query={trackingQueryString(pickTrackingParams(await searchParams))} />;
}
