import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicStoreProduct } from "@/lib/chariow/public-catalog";
import { BuyerCheckout } from "@/components/BuyerCheckout";

export default async function PublicProductPage({ params }: { params: Promise<{ storeSlug: string; productSlug: string }> }) {
  const { storeSlug, productSlug } = await params;
  const supabase = createAdminClient();
  const { data: store } = await supabase.from("stores").select("id,store_name,slug,mcp_url,access_token_encrypted,is_active,platform").eq("slug", storeSlug).eq("is_active", true).eq("platform", "chariow").maybeSingle();
  if (!store) notFound();
  const result = await getPublicStoreProduct(store, productSlug).catch(() => null);
  if (!result || ["service", "coaching", "pay-what-you-want", "pay_what_you_want"].includes((result.product.type ?? "").toLowerCase())) notFound();
  return <main className="public-product-page"><div className="public-product-card">{result.product.image ? <img src={result.product.image} alt="" className="public-product-image" /> : null}<span className="eyebrow">{store.store_name}</span><h1>{result.product.name}</h1>{result.product.description ? <p>{result.product.description}</p> : null}<strong className="public-product-price">{result.product.price ?? "Prix disponible sur Chariow"} {result.product.currency ?? ""}</strong><BuyerCheckout storeSlug={store.slug} productSlug={result.product.slug} productId={result.product.id} /></div></main>;
}
