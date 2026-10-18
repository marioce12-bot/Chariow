import { describe, expect, it } from "vitest";
import { aggregateProductProfit, CHARIOW_FEE_RATE, type ProductSales } from "./product-profit-math";

const sale = (overrides: Partial<ProductSales> = {}): ProductSales => ({
  product_id: "ebook", product_name: "Guide", amount: 10000,
  net_amount: null, currency: "XOF", status: "completed", ...overrides,
});
const result = (overrides: Partial<ProductSales> = {}) => aggregateProductProfit([sale(overrides)], [])[0];

describe("aggregateProductProfit", () => {
  it("defaults ebook costs to zero and deducts 15 percent without requiring a save", () => {
    expect(CHARIOW_FEE_RATE).toBe(0.15);
    expect(result()).toMatchObject({
      grossRevenue: 10000, netRevenue: 8500, chariowFees: 1500,
      chariowFeeRate: 0.15, estimatedNetRevenue: true,
      totalCosts: 0, profit: null, marginPercent: null, costStatus: "complete",
    });
  });
  it("never deducts platform fees again from a real Chariow net", () => {
    expect(result({ net_amount: 8500 })).toMatchObject({
      netRevenue: 8500, profit: null, chariowFees: 1500, estimatedNetRevenue: false,
    });
    expect(result({ net_amount: 9000 })).toMatchObject({
      netRevenue: 9000, profit: null, chariowFees: 1000, estimatedNetRevenue: false,
    });
  });
  it("uses real zero net instead of inventing income", () => {
    expect(result({ net_amount: 0 })).toMatchObject({ netRevenue: 0, profit: null, estimatedNetRevenue: false });
    expect(result({ net_amount: 0, raw_payload: { settlement: { amount: { value: 0 } } } })).toMatchObject({ netRevenue: 0, estimatedNetRevenue: false });
  });
  it("recognizes imported placeholder zero when source has no net amount", () => {
    expect(result({ net_amount: 0, raw_payload: { id: "sale", settlement: { amount: null } } })).toMatchObject({
      netRevenue: 8500, profit: null, estimatedNetRevenue: true,
    });
  });
  it("recognizes webhook and direct source nets, including string amounts", () => {
    for (const raw_payload of [
      { settlement: { amount: { value: "8500" } } },
      { net_amount: "8500" },
      { data: { settlement: { amount: { value: 8500 } } } },
      { payload: { net_amount: 8500 } },
      { sale: { net_amount: 8500 } },
    ]) expect(result({ net_amount: 0, raw_payload })).toMatchObject({ netRevenue: 8500, estimatedNetRevenue: false });
  });
  it("subtracts only optional manufacturing and OTHER fees from received net", () => {
    expect(aggregateProductProfit([sale({ amount: 100, net_amount: 90, status: "settled", currency: "usd" })], [
      { product_id: "ebook", currency: "USD", unit_cost: 20, fee_per_sale: 5 },
    ])[0]).toMatchObject({ netRevenue: 90, totalCosts: 25, profit: null, marginPercent: null });
  });
  it("handles mixed actual and estimated nets sale by sale", () => {
    const [product] = aggregateProductProfit([sale({ net_amount: 8500 }), sale({ amount: 20000 })], []);
    expect(product).toMatchObject({ units: 2, grossRevenue: 30000, netRevenue: 25500, chariowFees: 4500, profit: null, estimatedNetRevenue: true });
  });
  it("keeps currencies separate and excludes refunds and unconfirmed statuses", () => {
    const products = aggregateProductProfit([
      sale(), sale({ currency: "USD", amount: 10 }),
      sale({ status: "refunded" }), sale({ status: "failed" }),
    ], []);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({ currency: "XOF", units: 1, refunds: 1, profit: null });
    expect(products[1]).toMatchObject({ currency: "USD", units: 1, profit: null });
  });
  it("does not invent revenue when both gross and net are missing or malformed", () => {
    for (const amount of [null, "invalid", ""]) expect(result({ amount })).toMatchObject({ netRevenue: null, profit: null, chariowFees: null, marginPercent: null });
  });
  it("rounds monetary results to two decimals", () => {
    expect(result({ amount: 1.1 })).toMatchObject({ netRevenue: 0.94, chariowFees: 0.16, profit: null });
  });
  it("counts paid sales and campaign attribution only when Chariow provides a campaign link", () => {
    const [p] = aggregateProductProfit([
      sale({ status: "paid", chariow_campaign_id: "c1", chariow_campaign_name: "Launch" }),
      sale({ status: "paid" }),
    ], []);
    expect(p).toMatchObject({ units: 2, provenance: { paidSales: 2, campaignLinkedSales: 1, reliability: "complete" }, campaigns: [{ id: "c1", name: "Launch", sales: 1 }] });
  });
  it("nets refunds against paid sales without counting a refund as a paid unit", () => {
    const [p] = aggregateProductProfit([
      sale({ amount: 100, net_amount: 85 }),
      sale({ status: "refunded", amount: 100, net_amount: 85 }),
    ], []);
    expect(p).toMatchObject({ units: 1, refunds: 1, grossRevenue: 0, netRevenue: 0, profit: null, provenance: { paidSales: 1, refundCount: 1 } });
  });
  it("keeps legacy synthesized zero net unknown and never turns missing gross into zero", () => {
    expect(result({ amount: null, net_amount: 0, raw_payload: { id: "old-row" } })).toMatchObject({ grossRevenue: null, netRevenue: null, profit: null });
  });
  it("deducts signed refunds exactly once and leaves unknown refund impact unknown", () => {
    for (const sign of [1, -1]) {
      const [p] = aggregateProductProfit([
        sale({ amount: 100, net_amount: 85 }),
        sale({ status: "refunded", amount: 100 * sign, net_amount: 85 * sign }),
      ], []);
      expect(p).toMatchObject({ grossRevenue: 0, netRevenue: 0, refunds: 1, profit: null });
    }
    const [unknown] = aggregateProductProfit([sale(), sale({ status: "refunded", amount: -100, net_amount: null })], []);
    expect(unknown).toMatchObject({ netRevenue: null, profit: null, chariowFees: null });
  });
  it("keeps unavailable amounts null and separates currencies", () => {
    const products = aggregateProductProfit([
      sale({ amount: null, net_amount: null }),
      sale({ currency: "USD", amount: 10, net_amount: null }),
    ], []);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({ grossRevenue: null, netRevenue: null, profit: null, provenance: { reliability: "partial" } });
    expect(products[1]).toMatchObject({ currency: "USD", netRevenue: 8.5, estimatedNetRevenue: true });
  });
});
