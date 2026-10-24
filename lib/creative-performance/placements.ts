type LinkCampaignMediaInput = {
  userId: string;
  storeId: string;
  campaignId: string;
  campaignName: string;
  platform: "meta" | "tiktok" | "pinterest";
  productId: string;
  productName: string | null;
  variantLabel?: string | null;
  mediaUrls: string[];
};

/** Lie les URLs déjà fingerprintées à une campagne sans créer de fiche à partir d'une URL seule. */
export async function linkCampaignMedia(supabase: any, input: LinkCampaignMediaInput): Promise<{ linked: number; mediaCount: number }> {
  const urls = [...new Set(input.mediaUrls.map((url) => url.trim()).filter(Boolean))];
  if (!urls.length) return { linked: 0, mediaCount: 0 };
  const { data: urlRows, error: urlError } = await supabase
    .from("creative_media_asset_urls")
    .select("url,asset_id")
    .eq("user_id", input.userId)
    .in("url", urls);
  if (urlError) throw urlError;
  const assetById = new Map<string, string[]>();
  for (const row of urlRows ?? []) {
    const urlsForAsset = assetById.get(String(row.asset_id)) ?? [];
    urlsForAsset.push(String(row.url));
    assetById.set(String(row.asset_id), urlsForAsset);
  }
  if (!assetById.size) return { linked: 0, mediaCount: 0 };
  const assets = [...assetById.entries()];
  const placements = assets.map(([assetId, matchedUrls], index) => ({
    user_id: input.userId,
    store_id: input.storeId,
    asset_id: assetId,
    ad_campaign_id: input.campaignId,
    campaign_key: input.campaignId,
    campaign_name_snapshot: input.campaignName,
    platform: input.platform,
    product_id: input.productId,
    product_name_snapshot: input.productName,
    variant_label: input.variantLabel?.trim() || null,
    campaign_status_snapshot: "draft",
    is_multi_media: urls.length > 1,
    asset_index: Math.max(0, urls.indexOf(matchedUrls[0] ?? urls[0])),
  }));
  const { data, error } = await supabase
    .from("creative_media_placements")
    .upsert(placements, { onConflict: "user_id,campaign_key,asset_id" })
    .select("id");
  if (error) throw error;
  return { linked: data?.length ?? placements.length, mediaCount: assets.length };
}
