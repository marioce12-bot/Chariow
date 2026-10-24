import { describe, expect, it } from "vitest";
import { buildVisualRecommendationCandidates, findVisualIdeaSourceCampaigns, selectVisualIdeaCampaign } from "./idea-candidates";

const campaign = (campaignId: string, productId: string, orders: number | null, clicks: number) => ({
  campaignId,
  name: campaignId,
  platform: "meta",
  status: "active",
  productId,
  productName: `Produit ${productId}`,
  launched: true,
  analyzed: true,
  metrics: {
    scope: "campaign",
    currency: "USD",
    spend: 20,
    clicks,
    impressions: 500,
    attributedOrders: orders,
    attributedRevenue: orders === null ? null : orders * 30,
    attributedCurrency: orders === null ? null : "USD",
  },
});

const data = {
  period: { from: "2026-09-25", to: "2026-10-24" },
  campaigns: [campaign("campaign-lower", "product-1", 2, 40), campaign("campaign-best", "product-1", 5, 80), campaign("campaign-unmeasured", "product-2", null, 0)],
  productEligibility: [
    { productId: "product-1", productName: "Produit product-1", launchedCampaigns: 2, analyzedCampaigns: 2, eligible: true },
    { productId: "product-2", productName: "Produit product-2", launchedCampaigns: 1, analyzedCampaigns: 0, eligible: false },
  ],
} as any;

describe("creative idea recommendation availability", () => {
  it("selects the strongest actually analyzed campaign for an eligible product", () => {
    expect(selectVisualIdeaCampaign(data.campaigns, "product-1")?.campaignId).toBe("campaign-best");
    expect(findVisualIdeaSourceCampaigns(data).map(({ product }) => product.productId)).toEqual(["product-1"]);
  });

  it("does not create a badge candidate until the exact period has a usable snapshot", () => {
    expect(buildVisualRecommendationCandidates(data, new Set()).map(({ productId }) => productId)).toEqual([]);
    const candidates = buildVisualRecommendationCandidates(data, new Set(["campaign-best"]));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ productId: "product-1", campaignId: "campaign-best", platform: "meta" });
    expect(candidates[0].signature).toContain('"campaignId":"campaign-best"');
    expect(buildVisualRecommendationCandidates(data, new Set(["campaign-unmeasured"]))).toEqual([]);
  });
});
