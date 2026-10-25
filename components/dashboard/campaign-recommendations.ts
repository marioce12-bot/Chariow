import type { EditableCampaign } from "../vendeo/wizard/types";
import type { Campaign, PerformanceData } from "@/lib/creative-performance/types";

export type CampaignRecord = EditableCampaign & {
  status?: string | null;
  external_campaign_id?: string | null;
  updated_at?: string | null;
};
export type CampaignRecommendation = { campaign: Campaign; config: CampaignRecord };

export function buildCampaignRecommendations(
  data: PerformanceData | null,
  campaignRecords: CampaignRecord[],
): Map<string, CampaignRecommendation> {
  const recordsById = new Map(campaignRecords.map((campaign) => [campaign.id, campaign]));
  const result = new Map<string, CampaignRecommendation>();
  for (const product of data?.productEligibility ?? []) {
    if (!product.eligible) continue;
    const candidates = (data?.campaigns ?? []).flatMap((campaign) => {
      const metrics = campaign.metrics;
      if (campaign.productId !== product.productId || !campaign.launched || !campaign.analyzed || !metrics ||
          !metrics.currency || !metrics.attributedCurrency || metrics.currency !== metrics.attributedCurrency ||
          metrics.attributedOrders === null || metrics.attributedOrders <= 0 || metrics.attributedRevenue === null ||
          metrics.spend <= 0 || metrics.attributedRevenue <= metrics.spend) return [];
      const config = recordsById.get(campaign.campaignId);
      return config ? [{ campaign, config }] : [];
    }).sort((left, right) => {
      const leftMetrics = left.campaign.metrics!;
      const rightMetrics = right.campaign.metrics!;
      return (rightMetrics.attributedRevenue! / rightMetrics.spend) - (leftMetrics.attributedRevenue! / leftMetrics.spend);
    });
    if (candidates[0]) result.set(product.productId, candidates[0]);
  }
  return result;
}

export function selectStrongestCampaignRecommendation(
  recommendations: Iterable<CampaignRecommendation>,
): CampaignRecommendation | null {
  return [...recommendations].sort((left, right) => {
    const leftMetrics = left.campaign.metrics!;
    const rightMetrics = right.campaign.metrics!;
    const leftRoas = leftMetrics.attributedRevenue! / leftMetrics.spend;
    const rightRoas = rightMetrics.attributedRevenue! / rightMetrics.spend;
    return (rightRoas - leftRoas) || (rightMetrics.attributedOrders! - leftMetrics.attributedOrders!);
  })[0] ?? null;
}

export function campaignRecommendationFingerprint(
  recommendation: CampaignRecommendation,
  period: PerformanceData["period"],
): string {
  const { campaign, config } = recommendation;
  const metrics = campaign.metrics!;
  return JSON.stringify({
    version: 1,
    campaignId: campaign.campaignId,
    productId: campaign.productId,
    platform: campaign.platform,
    period,
    metrics: {
      currency: metrics.currency,
      spend: metrics.spend,
      clicks: metrics.clicks,
      impressions: metrics.impressions,
      attributedOrders: metrics.attributedOrders,
      attributedRevenue: metrics.attributedRevenue,
      attributedCurrency: metrics.attributedCurrency,
    },
    sourceConfig: {
      id: config.id,
      platform: config.platform,
      title: config.title,
      adText: config.ad_text,
      dailyBudget: config.daily_budget,
      durationDays: config.duration_days,
      updatedAt: config.updated_at ?? null,
    },
  });
}
