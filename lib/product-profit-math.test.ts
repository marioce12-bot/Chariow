import { describe, expect, it } from "vitest";
import { aggregateProductProfit } from "./product-profit-math";

describe("aggregateProductProfit", () => {
  it("uses net receipts less supplied costs and recognizes settled sales", () => {
    const result = aggregateProductProfit(
      [
        {
          product_id: "ebook",
          amount: 100,
          net_amount: 90,
          currency: "usd",
          status: "settled",
          product_name: "Guide",
        },
      ],
      [
        {
          product_id: "ebook",
          currency: "USD",
          unit_cost: 20,
          fee_per_sale: 5,
        },
      ],
    );
    expect(result).toEqual([
      {
        productId: "ebook",
        productName: "Guide",
        currency: "USD",
        units: 1,
        grossRevenue: 100,
        netRevenue: 90,
        totalCosts: 25,
        profit: 65,
        marginPercent: 72.22222222222221,
        costStatus: "complete",
      },
    ]);
  });
  it("rejects invented statuses and refunds and never turns absent net into zero", () => {
    const result = aggregateProductProfit(
      [
        {
          product_id: "x",
          amount: 100,
          net_amount: 80,
          currency: "XOF",
          status: "completed",
        },
        {
          product_id: "x",
          amount: 20,
          net_amount: null,
          currency: "XOF",
          status: "settled",
        },
        {
          product_id: "x",
          amount: 1,
          net_amount: 0.9,
          currency: "USD",
          status: "paid",
        },
        {
          product_id: "x",
          amount: 40,
          net_amount: 35,
          currency: "XOF",
          status: "refunded",
        },
      ],
      [{ product_id: "x", currency: "XOF", unit_cost: 0, fee_per_sale: 0 }],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      currency: "XOF",
      units: 2,
      grossRevenue: 120,
      netRevenue: null,
      totalCosts: 0,
      profit: null,
      marginPercent: null,
      costStatus: "complete",
    });
  });
  it("keeps currencies separate and missing costs incomplete", () => {
    const result = aggregateProductProfit(
      [
        {
          product_id: "x",
          amount: 100,
          net_amount: 80,
          currency: "XOF",
          status: "completed",
        },
        {
          product_id: "x",
          amount: 1,
          net_amount: 0.9,
          currency: "USD",
          status: "settled",
        },
      ],
      [],
    );
    expect(result).toHaveLength(2);
    expect(result.map((x) => x.currency)).toEqual(["XOF", "USD"]);
    expect(result[0]).toMatchObject({
      units: 1,
      netRevenue: 80,
      totalCosts: null,
      profit: null,
      costStatus: "incomplete",
    });
  });
});
