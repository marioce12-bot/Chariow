const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LAUNCHED = new Set(["active", "paused", "autopilot_paused", "completed", "archived", "deleted"]);

export type CreativePerformanceStudioSource = {
  storeId: string;
  productId: string;
  productName: string;
  campaignId: string;
  campaignName: string;
  platform: string;
  assetId: string | null;
  imageUrl: string | null;
  period: { from: string; to: string };
  evidence: {
    scope: string;
    currency: string | null;
    spend: number;
    clicks: number;
    impressions: number;
    attributedOrders: number | null;
    attributedRevenue: number | null;
    attributedCurrency: string | null;
  };
};

export async function validateCreativePerformanceStudioSource(
  admin: any,
  userId: string,
  input: any,
): Promise<{ source: CreativePerformanceStudioSource | null; error: string | null }> {
  const raw = input?.creativePerformanceSource;
  if (raw === undefined || raw === null) return { source: null, error: null };
  if (!raw || typeof raw !== "object" || !UUID.test(raw.storeId) || !UUID.test(raw.campaignId) ||
      typeof raw.productId !== "string" || !raw.productId || raw.productId.length > 200 ||
      !raw.period || !DATE.test(raw.period.from) || !DATE.test(raw.period.to)) {
    return { source: null, error: "La provenance Performance publicitaire est invalide; retourne à cette section puis sélectionne une proposition." };
  }
  if (input.product?.id !== raw.productId) {
    return { source: null, error: "Le produit choisi ne correspond plus à la campagne source. Sélectionne de nouveau la proposition depuis Performance publicitaire." };
  }
  const { data: campaign, error: campaignError } = await admin.from("ad_campaigns")
    .select("id,store_id,product_id,product_name,platform,status,title,external_campaign_id")
    .eq("id", raw.campaignId).eq("store_id", raw.storeId).eq("user_id", userId).maybeSingle();
  if (campaignError || !campaign || campaign.product_id !== raw.productId || !campaign.external_campaign_id || !LAUNCHED.has(campaign.status)) {
    return { source: null, error: "La campagne source n’est plus disponible ou n’a pas réellement été lancée." };
  }
  const { data: snapshot, error: snapshotError } = await admin.from("creative_campaign_metric_snapshots")
    .select("currency,spend,clicks,impressions,attributed_orders,attributed_revenue,attributed_currency,metric_scope")
    .eq("user_id", userId).eq("store_id", raw.storeId).eq("campaign_key", campaign.id)
    .eq("period_from", raw.period.from).eq("period_to", raw.period.to)
    .neq("metric_scope", "unavailable").maybeSingle();
  if (snapshotError || !snapshot || snapshot.metric_scope === "unavailable" || !(Number(snapshot.spend) > 0 || Number(snapshot.clicks) > 0 || Number(snapshot.impressions) > 0)) {
    return { source: null, error: "Les résultats de la campagne n’ont pas pu être vérifiés. Aucune génération n’a été lancée." };
  }
  let assetId: string | null = null;
  let imageUrl: string | null = null;
  if (raw.assetId !== null && raw.assetId !== undefined) {
    if (typeof raw.assetId !== "string" || !UUID.test(raw.assetId)) {
      return { source: null, error: "Le média source sélectionné est invalide." };
    }
    const { data: placements, error: placementError } = await admin.from("creative_media_placements")
      .select("asset_id,is_multi_media,product_id")
      .eq("user_id", userId).eq("store_id", raw.storeId).eq("campaign_key", campaign.id);
    const placement = placements?.find((row: any) => row.asset_id === raw.assetId);
    if (placementError || !placement || placements?.length !== 1 || placement.product_id !== raw.productId || placement.is_multi_media) {
      return { source: null, error: "Ce média n’a pas de résultats fiables à son propre niveau; aucune génération n’a été lancée." };
    }
    if (snapshot.attributed_orders === null || snapshot.attributed_revenue === null || !snapshot.attributed_currency ||
        snapshot.attributed_currency !== snapshot.currency || Number(snapshot.attributed_revenue) <= Number(snapshot.spend)) {
      return { source: null, error: "Ce créatif n’a pas de résultat attribué qui le classe gagnant; aucune génération n’a été lancée." };
    }
    const { data: asset, error: assetError } = await admin.from("creative_media_assets")
      .select("id,kind,delivery_url").eq("id", raw.assetId).eq("user_id", userId).maybeSingle();
    if (assetError || !asset) return { source: null, error: "Le média source est indisponible." };
    assetId = asset.id;
    if (asset.kind === "image" && typeof asset.delivery_url === "string") imageUrl = asset.delivery_url;
  }
  return {
    error: null,
    source: {
      storeId: campaign.store_id,
      productId: campaign.product_id,
      productName: campaign.product_name || input.product?.name || campaign.product_id,
      campaignId: campaign.id,
      campaignName: campaign.title || campaign.product_name || campaign.id,
      platform: campaign.platform,
      assetId, imageUrl,
      period: { from: raw.period.from, to: raw.period.to },
      evidence: {
        scope: snapshot.metric_scope,
        currency: snapshot.currency,
        spend: Number(snapshot.spend),
        clicks: Number(snapshot.clicks),
        impressions: Number(snapshot.impressions),
        attributedOrders: snapshot.attributed_orders === null ? null : Number(snapshot.attributed_orders),
        attributedRevenue: snapshot.attributed_revenue === null ? null : Number(snapshot.attributed_revenue),
        attributedCurrency: snapshot.attributed_currency,
      },
    },
  };
}
