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
      totalCosts: 0, profit: 8500, marginPercent: 85, costStatus: "complete",
    });
  });
  it("never deducts platform fees again from a real Chariow net", () => {
    expect(result({ net_amount: 8500 })).toMatchObject({
      netRevenue: 8500, profit: 8500, chariowFees: 1500, estimatedNetRevenue: false,
    });
    expect(result({ net_amount: 9000 })).toMatchObject({
      netRevenue: 9000, profit: 9000, chariowFees: 1000, estimatedNetRevenue: false,
    });
  });
  it("uses real zero net instead of inventing income", () => {
    expect(result({ net_amount: 0 })).toMatchObject({ netRevenue: 0, profit: 0, estimatedNetRevenue: false });
    expect(result({ net_amount: 0, raw_payload: { settlement: { amount: { value: 0 } } } })).toMatchObject({ netRevenue: 0, estimatedNetRevenue: false });
  });
  it("recognizes imported placeholder zero when source has no net amount", () => {
    expect(result({ net_amount: 0, raw_payload: { id: "sale", settlement: { amount: null } } })).toMatchObject({
      netRevenue: 8500, profit: 8500, estimatedNetRevenue: true,
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
    ])[0]).toMatchObject({ netRevenue: 90, totalCosts: 25, profit: 65, marginPercent: 65 });
  });
  it("handles mixed actual and estimated nets sale by sale", () => {
    const [product] = aggregateProductProfit([sale({ net_amount: 8500 }), sale({ amount: 20000 })], []);
    expect(product).toMatchObject({ units: 2, grossRevenue: 30000, netRevenue: 25500, chariowFees: 4500, profit: 25500, estimatedNetRevenue: true });
  });
  it("keeps currencies separate and excludes refunds and unconfirmed statuses", () => {
    const products = aggregateProductProfit([
      sale(), sale({ currency: "USD", amount: 10 }),
      sale({ status: "refunded" }), sale({ status: "paid" }), sale({ status: "failed" }),
    ], []);
    expect(products).toHaveLength(2);
    expect(products[0]).toMatchObject({ currency: "XOF", units: 1, profit: 8500 });
    expect(products[1]).toMatchObject({ currency: "USD", units: 1, profit: 8.5 });
  });
  it("does not invent revenue when both gross and net are missing or malformed", () => {
    for (const amount of [null, "invalid", ""]) expect(result({ amount })).toMatchObject({ netRevenue: null, profit: null, chariowFees: null, marginPercent: null });
  });
  it("rounds monetary results to two decimals", () => {
    expect(result({ amount: 1.1 })).toMatchObject({ netRevenue: 0.94, chariowFees: 0.16, profit: 0.94 });
  });
});
