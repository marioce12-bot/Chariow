import { describe, expect, it } from "vitest";
import { aggregateProductProfit } from "../product-profit-math";

describe("Shopify product profit", () => {
  const sale = (overrides: Record<string, unknown> = {}) => ({
    product_id: "order-product", product_name: "Order", amount: 100,
    net_amount: null, currency: "USD", status: "paid",
    raw_payload: { provider: "shopify" }, ...overrides,
  });

  it("never estimates Chariow fees or net for Shopify without explicit net", () => {
    const [result] = aggregateProductProfit([sale()], []);
    expect(result).toMatchObject({ grossRevenue: 100, netRevenue: null, chariowFees: null, chariowFeeRate: null, estimatedNetRevenue: false });
  });


  it("does not treat Shopify partial or full refunds as negative sales", () => {
    for (const financial of ["partially_refunded", "refunded"]) {
      const [result] = aggregateProductProfit([sale({ status: "paid", amount: 40, raw_payload: { provider: "shopify", original_financial_status: financial, line_items: [{ product_id: "a", title: "Alpha", quantity: 2, amount: null, currency: "USD" }] } })], []);
      expect(result).toMatchObject({ productId: "a", grossRevenue: null, units: 0, refunds: 0 });
    }
  });
  it("aggregates Shopify line items by product and quantity", () => {
    const result = aggregateProductProfit([sale({ raw_payload: { provider: "shopify", line_items: [
      { product_id: "a", title: "Alpha", quantity: 2, amount: 40, currency: "USD" },
      { product_id: "b", title: "Beta", quantity: 1, amount: 60, currency: "USD" },
    ] } })], []);
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ productId: "a", productName: "Alpha", units: 2, grossRevenue: 40, netRevenue: null, chariowFees: null, estimatedNetRevenue: false }),
      expect.objectContaining({ productId: "b", productName: "Beta", units: 1, grossRevenue: 60, netRevenue: null, chariowFees: null, estimatedNetRevenue: false }),
    ]));
  });
});
