import { describe, expect, it } from "vitest";
import { calculateHomeNetProfitUsd, calculateProductCampaignSpendUsd } from "./home-financials";

describe("home financials", () => {
  it("additionne une seule fois les campagnes Vendeo des produits d’une boutique", () => {
    const campaigns = [
      { product_id: "book-a", platform: "meta", external_campaign_id: "m1", meta_ad_account_id: "meta-a" },
      { product_id: "book-a", platform: "meta", external_campaign_id: "m1", meta_ad_account_id: "meta-a" },
      { product_id: "book-b", platform: "tiktok", external_campaign_id: "t1", tiktok_ad_account_id: "tt-a" },
      { product_id: "book-c", platform: "pinterest", external_campaign_id: "p1", pinterest_ad_account_id: "pin-a" },
    ];
    const result = calculateProductCampaignSpendUsd(campaigns, [
      { platform: "meta", accountId: "meta-a", ok: true, convertible: true, campaigns: [{ id: "m1", spendUsd: 12.5 }] },
      { platform: "tiktok", accountId: "tt-a", ok: true, convertible: true, campaigns: [{ id: "t1", spendUsd: 7.25 }] },
      { platform: "pinterest", accountId: "pin-a", ok: true, convertible: true, campaigns: [{ id: "p1", spendUsd: 3 }] },
    ]);
    expect(result).toEqual({ spendUsd: 22.75, complete: true, campaignCount: 3 });
  });

  it("ne transforme pas une lecture manquante, périmée ou non convertible en dépense nulle", () => {
    const campaign = { product_id: "book-a", platform: "meta", external_campaign_id: "m1", meta_ad_account_id: "meta-a" };
    expect(calculateProductCampaignSpendUsd([campaign], []).complete).toBe(false);
    expect(calculateProductCampaignSpendUsd([campaign], [
      { platform: "meta", accountId: "meta-a", ok: true, stale: true, convertible: true, campaigns: [{ id: "m1", spendUsd: 12 }] },
    ]).spendUsd).toBeNull();
    expect(calculateProductCampaignSpendUsd([campaign], [
      { platform: "meta", accountId: "meta-a", ok: true, convertible: false, campaigns: [{ id: "m1", spendUsd: null }] },
    ]).complete).toBe(false);
  });

  it("calcule les bénéfices en retirant la publicité d’un revenu déjà net des frais Chariow", () => {
    expect(calculateHomeNetProfitUsd({
      revenueAfterChariowFees: 85,
      revenueCurrency: "USD",
      campaignSpendUsd: 22.75,
      campaignSpendComplete: true,
    })).toBe(62.25);
    expect(calculateHomeNetProfitUsd({
      revenueAfterChariowFees: 20,
      revenueCurrency: "USD",
      campaignSpendUsd: 22.75,
      campaignSpendComplete: true,
    })).toBe(-2.75);
    expect(calculateHomeNetProfitUsd({
      revenueAfterChariowFees: 85,
      revenueCurrency: "USD",
      campaignSpendUsd: null,
      campaignSpendComplete: false,
    })).toBeNull();
  });
});
