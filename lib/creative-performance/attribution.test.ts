import { describe, expect, it } from "vitest";
import { resolveUniqueSaleCampaignLinks } from "./attribution";

describe("resolveUniqueSaleCampaignLinks", () => {
  it("attributes confirmed sales only to one campaign", () => {
    const result = resolveUniqueSaleCampaignLinks([
      { saleId: "sale-1", campaignId: "campaign-a" },
      { saleId: "sale-2", campaignId: "campaign-b" },
    ], new Set(["sale-1", "sale-2"]));

    expect(result.saleIdsByCampaign.get("campaign-a")).toEqual(new Set(["sale-1"]));
    expect(result.saleIdsByCampaign.get("campaign-b")).toEqual(new Set(["sale-2"]));
    expect(result.assignedSaleIds.size).toBe(2);
    expect(result.ambiguousCampaignIds.size).toBe(0);
  });

  it("withholds a sale linked to multiple campaigns and flags both as ambiguous", () => {
    const result = resolveUniqueSaleCampaignLinks([
      { saleId: "sale-1", campaignId: "campaign-a" },
      { saleId: "sale-1", campaignId: "campaign-b" },
    ], new Set(["sale-1"]));

    expect(result.saleIdsByCampaign.size).toBe(0);
    expect(result.ambiguousCampaignIds).toEqual(new Set(["campaign-a", "campaign-b"]));
    expect(result.assignedSaleIds).toEqual(new Set(["sale-1"]));
  });

  it("ignores unconfirmed sales", () => {
    const result = resolveUniqueSaleCampaignLinks([
      { saleId: "pending", campaignId: "campaign-a" },
    ], new Set());

    expect(result.saleIdsByCampaign.size).toBe(0);
    expect(result.assignedSaleIds.size).toBe(0);
    expect(result.ambiguousCampaignIds.size).toBe(0);
  });
});
