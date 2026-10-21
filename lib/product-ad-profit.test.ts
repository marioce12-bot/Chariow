import { describe, expect, it } from "vitest";
import { enrichProductAdProfit, type ProductAdProfitInput } from "./product-ad-profit";

const base = (patch: Partial<ProductAdProfitInput> = {}): ProductAdProfitInput => ({
  products: [{ id: "internal-1", chariowProductId: "char-1", destinationUrl: "https://shop.test/p" }, { id: "internal-2", chariowProductId: "char-2", destinationUrl: "https://shop.test/q" }],
  campaigns: [{ id: "meta-row-1", metaCampaignId: "meta-1", productId: "char-1" }],
  links: [],
  accounts: [{ id: "acct", currency: "USD", lastSyncedAt: "2026-10-21T12:00:00Z", syncError: null, syncComplete: true, syncedFrom: "2026-10-20", syncedTo: "2026-10-21" }],
  insights: [
    { accountId: "acct", level: "campaign", entityId: "meta-1", dateStart: "2026-10-20", dateStop: "2026-10-20", spend: "4", conversions: "2", conversionValue: "20" },
    { accountId: "acct", level: "campaign", entityId: "meta-1", dateStart: "2026-10-21", dateStop: "2026-10-21", spend: "6", conversions: "1", conversionValue: "10" },
  ],
  since: "2026-10-20", until: "2026-10-21", now: new Date("2026-10-21T13:00:00Z"),
  aggregate: [{ productId: "internal-1", currency: "USD", netRevenue: 80, totalCosts: 10 }],
  ...patch,
});
const result = (input: ProductAdProfitInput = base()) => enrichProductAdProfit(input)[0];

describe("enrichProductAdProfit", () => {
  it("adds only explicitly linked daily campaign spend, keeps Meta conversions separate, and subtracts no fees again", () => {
    expect(result()).toMatchObject({ adSpend: 10, profit: 60, adSpendStatus: "complete", linkedCampaignCount: 1, metaPurchases: 3, metaPurchaseValue: 30, metaCurrency: "USD" });
    expect(result().adSpendReasons).toEqual([]);
  });
  it("does not infer a product from a page/URL when URL is not an exact unique product URL", () => {
    const r = result(base({ campaigns: [{ id: "meta-row-1", metaCampaignId: "meta-1", destinationUrl: "https://shop.test/" }] }));
    expect(r.adSpend).toBeNull(); expect(r.adSpendStatus).toBe("unavailable");
  });
  it("uses exact unique destination URL when no product id/link exists", () => {
    const r = result(base({ campaigns: [{ id: "meta-row-1", metaCampaignId: "meta-1", destinationUrl: "https://shop.test/p" }] }));
    expect(r.adSpend).toBe(10);
  });
  it("marks multi-product campaigns ambiguous and never duplicates/allocation-splits spend", () => {
    const r = result(base({ campaigns: [{ id: "meta-row-1", metaCampaignId: "meta-1", productId: "char-1" }], links: [{ campaignId: "meta-row-1", productId: "char-2" }] }));
    expect(r.adSpend).toBeNull(); expect(r.adSpendStatus).toBe("ambiguous");
  });
  it("keeps absent campaign data null and rejects unavailable or errored sync", () => {
    expect(result(base({ insights: [] })).adSpend).toBeNull();
    expect(result(base({ accounts: [{ ...base().accounts[0], syncComplete: false }] })).adSpend).toBeNull();
    expect(result(base({ accounts: [{ ...base().accounts[0], syncError: "timeout" }] })).adSpend).toBeNull();
  });
  it("rejects invalid period and incomplete daily coverage", () => {
    expect(result(base({ since: "2026-02-30" })).adSpend).toBeNull();
    expect(result(base({ since: "2026-10-21", until: "2026-10-20" })).adSpend).toBeNull();
    expect(result(base({ insights: base().insights.slice(0, 1) })).adSpend).toBeNull();
  });
  it("does not convert currencies and does not claim profit across currency mismatch or multi-currency aggregates", () => {
    const fx = result(base({ accounts: [{ ...base().accounts[0], currency: "EUR" }] }));
    expect(fx.adSpendByCurrency).toEqual([{ currency: "EUR", amount: 10 }]); expect(fx.adSpend).toBeNull(); expect(fx.profit).toBeNull();
    const multi = enrichProductAdProfit(base({ aggregate: [base().aggregate[0], { productId: "internal-1", currency: "XOF", netRevenue: 5, totalCosts: 1 }] }));
    expect(multi).toHaveLength(2); expect(multi[0].adSpend).toBeNull(); expect(multi[1].adSpend).toBeNull();
  });
  it("does not alter Chariow refund or fee math: realized profit requires the supplied net after fees", () => {
    expect(result(base({ aggregate: [{ productId: "internal-1", currency: "USD", netRevenue: null, totalCosts: 10 }] })).profit).toBeNull();
    expect(result(base({ aggregate: [{ productId: "internal-1", currency: "USD", netRevenue: 85, totalCosts: 10 }] })).profit).toBe(65);
  });
  it("resolves external Chariow aggregate IDs before matching campaign targets", () => {
    const r = result(base({ aggregate: [{ productId: "char-1", currency: "USD", netRevenue: 80, totalCosts: 10 }] }));
    expect(r.adSpend).toBe(10); expect(r.profit).toBe(60);
  });
  it("limits multi-product ambiguity to affected products and counts but does not spend the shared campaign", () => {
    const input = base({ campaigns: [
      { id: "shared", metaCampaignId: "meta-1", productId: "char-1" },
      { id: "elsewhere", metaCampaignId: "meta-2", productId: "char-2" },
    ], links: [{ campaignId: "shared", productId: "char-2" }], aggregate: [
      { productId: "internal-1", currency: "USD", netRevenue: 80, totalCosts: 10 },
      { productId: "internal-2", currency: "USD", netRevenue: 80, totalCosts: 10 },
    ] });
    const [affected, other] = enrichProductAdProfit(input);
    expect(affected).toMatchObject({ adSpend: null, adSpendStatus: "ambiguous", linkedCampaignCount: 1 });
    expect(other).toMatchObject({ adSpend: null, adSpendStatus: "ambiguous", linkedCampaignCount: 2 });
  });
  it("blocks spend when sales aggregates have multiple currencies for the same product", () => {
    const [usd, eur] = enrichProductAdProfit(base({ aggregate: [
      { productId: "internal-1", currency: "USD", netRevenue: 80, totalCosts: 10 },
      { productId: "internal-1", currency: "EUR", netRevenue: 80, totalCosts: 10 },
    ] }));
    expect(usd.adSpend).toBeNull(); expect(eur.adSpend).toBeNull();
    expect(usd.adSpendByCurrency).toEqual([{ currency: "USD", amount: 10 }]);
  });
  it("requires complete conversion rows, rejects future sync timestamps, and gates profit on salesComplete", () => {
    const partialConversions = base({ insights: [{ ...base().insights[0], conversions: null }, base().insights[1]] });
    expect(result(partialConversions).metaPurchases).toBeNull();
    expect(result(base({ now: new Date("2026-10-21T11:00:00Z") })).adSpend).toBeNull();
    const incompleteSales = result(base({ salesComplete: false }));
    expect(incompleteSales.profit).toBeNull();
    expect(incompleteSales.adSpendReasons).toContain("Ventes incomplètes : le profit ne peut pas être calculé.");
  });
  it("requires explicit account association when multiple Meta accounts exist", () => {
    const accounts = [...base().accounts, { ...base().accounts[0], id: "acct-2" }];
    expect(result(base({ accounts })).adSpend).toBeNull();
    expect(result(base({ accounts, campaigns: [{ ...base().campaigns[0], accountId: "acct" }] })).adSpend).toBe(10);
  });
});
