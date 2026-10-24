export type CreativeMetric = {
  available: boolean;
  scope: string;
  currency: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  platformConversions: number | null;
  attributedOrders: number | null;
  attributedRevenue: number | null;
  attributedCurrency: string | null;
  attributionReliable: boolean;
};

export type Placement = {
  id: string;
  campaignId: string;
  campaignName: string;
  platform: string;
  status: string;
  productId: string | null;
  productName: string | null;
  variantLabel: string | null;
  isMultiMedia: boolean;
  metrics: CreativeMetric;
};

export type Media = {
  id: string;
  kind: "image" | "video";
  url: string;
  sha256: string;
  createdAt: string;
  spend: number | null;
  currency: string | null;
  spendByCurrency: Array<{ currency: string; amount: number }>;
  clicks: number | null;
  attributedOrders: number | null;
  attributedRevenue: number | null;
  attributedCurrency: string | null;
  costPerOrder: number | null;
  winner: boolean;
  metricsComplete: boolean;
  campaigns: Placement[];
};

export type Campaign = {
  campaignId: string;
  name: string;
  platform: string;
  status: string;
  productId: string | null;
  productName: string | null;
  launched: boolean;
  analyzed: boolean;
  metrics: {
    currency: string | null;
    spend: number;
    clicks: number;
    impressions: number;
    attributedOrders: number | null;
    attributedRevenue: number | null;
    attributedCurrency: string | null;
  } | null;
};

export type VisualRecommendationCandidate = {
  productId: string;
  productName: string;
  campaignId: string;
  platform: string;
  signature: string;
};

export type PerformanceData = {
  period: { from: string; to: string };
  metrics: {
    mediaCount: number;
    campaigns: number;
    launchedCampaigns: number;
    unavailableCampaignMetrics: number;
    totals: Array<{
      currency: string;
      spend: number;
      clicks: number;
      attributedOrders: number | null;
      costPerOrder: number | null;
      attributedRevenue: number | null;
      campaigns: number;
      complete: boolean;
    }>;
  };
  media: Media[];
  campaigns: Campaign[];
  productEligibility: Array<{
    productId: string;
    productName: string;
    launchedCampaigns: number;
    analyzedCampaigns: number;
    eligible: boolean;
  }>;
  visualRecommendations?: VisualRecommendationCandidate[];
  duplicateCandidates: Array<{ firstId: string; secondId: string; kind: string; distance: number }>;
  notices: { carousel?: string; tikTok?: string | null; pinterest?: string | null; variant?: string };
};
