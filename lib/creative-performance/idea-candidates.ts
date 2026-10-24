import type { Campaign, PerformanceData } from "@/components/dashboard/PerformanceVisuelView";

export type VisualRecommendationCandidate = {
  productId: string;
  productName: string;
  campaignId: string;
  platform: string;
  signature: string;
};

type VisualCandidateData = Pick<PerformanceData, "campaigns" | "productEligibility" | "period">;

/** Selects only a launched, analyzed campaign with actual measured metrics. */
export function selectVisualIdeaCampaign(
  campaigns: Campaign[],
  productId: string,
  linkedCampaignIds?: ReadonlySet<string> | null,
): Campaign | null {
  const analyzed = campaigns.filter((campaign) =>
    campaign.productId === productId && campaign.launched && campaign.analyzed && campaign.metrics &&
    (!linkedCampaignIds || linkedCampaignIds.has(campaign.campaignId)),
  );
  analyzed.sort((left, right) => {
    const leftOrders = left.metrics?.attributedOrders ?? -1;
    const rightOrders = right.metrics?.attributedOrders ?? -1;
    if (leftOrders !== rightOrders) return rightOrders - leftOrders;
    return (right.metrics?.clicks ?? 0) - (left.metrics?.clicks ?? 0);
  });
  return analyzed[0] ?? null;
}

/** Candidates are limited to products the current real-data algorithm marks eligible. */
export function findVisualIdeaSourceCampaigns(
  data: Pick<PerformanceData, "campaigns" | "productEligibility">,
) {
  return data.productEligibility.flatMap((product) => {
    if (!product.eligible) return [];
    const campaign = selectVisualIdeaCampaign(data.campaigns, product.productId);
    return campaign ? [{ product, campaign }] : [];
  });
}

/**
 * A proposal is badge-worthy only if its selected source has a stored, usable
 * provider snapshot for the same measured period. The notification endpoint can
 * call this with read-only data; it never runs the ideas or image-generation API.
 */
export function buildVisualRecommendationCandidates(
  data: VisualCandidateData,
  usableSnapshotCampaignIds: ReadonlySet<string>,
): VisualRecommendationCandidate[] {
  return findVisualIdeaSourceCampaigns(data)
    .filter(({ campaign }) => usableSnapshotCampaignIds.has(campaign.campaignId))
    .map(({ product, campaign }) => {
      const metrics = campaign.metrics!;
      const signature = JSON.stringify({
        version: 1,
        productId: product.productId,
        campaignId: campaign.campaignId,
        platform: campaign.platform,
        period: data.period,
        metrics: {
          currency: metrics.currency,
          spend: metrics.spend,
          clicks: metrics.clicks,
          impressions: metrics.impressions,
          attributedOrders: metrics.attributedOrders,
          attributedRevenue: metrics.attributedRevenue,
          attributedCurrency: metrics.attributedCurrency,
        },
      });
      return {
        productId: product.productId,
        productName: product.productName,
        campaignId: campaign.campaignId,
        platform: campaign.platform,
        signature,
      };
    })
    .sort((left, right) => {
      const leftCampaign = data.campaigns.find((campaign) => campaign.campaignId === left.campaignId)!;
      const rightCampaign = data.campaigns.find((campaign) => campaign.campaignId === right.campaignId)!;
      const leftOrders = leftCampaign.metrics?.attributedOrders ?? -1;
      const rightOrders = rightCampaign.metrics?.attributedOrders ?? -1;
      if (leftOrders !== rightOrders) return rightOrders - leftOrders;
      return (rightCampaign.metrics?.clicks ?? 0) - (leftCampaign.metrics?.clicks ?? 0);
    });
}
