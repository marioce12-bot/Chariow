import { describe, expect, it } from "vitest";
import { buildOverviewAggregates, buildOverviewFromPages, buildProductPerformance, daysBetween } from "./overview-aggregates";
import { mixedCurrencySales as mixedCurrencyFixtures, repeatBuyersSales as repeatBuyerFixtures, stateASales as stateAFixtures, stateDSales as stateDFixtures } from "@/tests/fixtures/unit-economics";

// These aggregate fixtures also require the timestamp selected by the production query.
const withDate = (rows: typeof stateAFixtures) => rows.map((row) => ({ ...row, status: row.status ?? null, net_amount: row.net_amount ?? null, currency: row.currency ?? null, customer_id: row.customer_id ?? null, occurred_at: "2026-10-01T12:00:00Z" }));
const stateASales = withDate(stateAFixtures);
const stateDSales = withDate(stateDFixtures);
const mixedCurrencySales = withDate(mixedCurrencyFixtures);
const repeatBuyersSales = withDate(repeatBuyerFixtures);
describe("overview server aggregates", () => {
  it("calcule revenu net, panier, clients, rachats et plafond sans données sensibles", () => {
    const result = buildOverviewAggregates(stateASales, "XOF", "2026-10-01", "2026-10-03");
    expect(result.revenueNet).toBe(42500);
    expect(result.averageBasket).toBe(10625);
    expect(result.customers).toBe(3);
    expect(result.repeatRate).toBeCloseTo(1 / 3, 5);
    expect(result.customerValue).toBeCloseTo(14166.67, 2);
    expect(result.maxCostPerCustomer).toBeCloseTo(9916.67, 2);
    expect(result.lowData).toBe(true);
    expect(result.revenueSeries).toHaveLength(3);
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("phone");
  });

  it("respecte les statuts confirmés et les conversions de devise", () => {
    const result = buildOverviewAggregates(mixedCurrencySales, "XOF", "2026-10-01", "2026-10-01");
    expect(result.sales).toBe(4);
    expect(result.skippedSales).toBe(2);
    expect(result.customerValue).toBeCloseTo(13119.14, 2);
    expect(result.averageBasket).toBeCloseTo(6559.57, 2);
  });

  it("retourne null si la pagination de l’une des périodes échoue", () => {
    const error = new Error("query failed");
    expect(buildOverviewFromPages(
      { rows: [], error },
      { rows: [], error: null },
      "XOF",
      "2026-10-01",
      "2026-10-07",
      null,
      0.3,
    )).toBeNull();
  });

  it("retourne un état vide propre sans chiffre inventé", () => {
    const result = buildOverviewAggregates(stateDSales, "XOF", "2026-10-01", "2026-10-07");
    expect(result.sales).toBe(0);
    expect(result.revenueNet).toBe(0);
    expect(result.averageBasket).toBeNull();
    expect(result.customerValue).toBeNull();
    expect(result.revenueSeries.every((point) => point.revenueNet === 0)).toBe(true);
  });

  it("calcule les rachats sur customer_id uniquement", () => {
    const result = buildOverviewAggregates(repeatBuyersSales, "XOF", "2026-10-01", "2026-10-01");
    expect(result.customers).toBe(3);
    expect(result.repeatRate).toBeCloseTo(2 / 3, 5);
  });

  it("calcule correctement la taille de période", () => {
    expect(daysBetween("2026-10-01", "2026-10-07")).toBe(7);
  });

  it("agrège le revenu net par produit, convertit les devises et ignore les ventes non confirmées", () => {
    const products = [
      { id: "p1", name: "Livre", image: null },
      { id: "p2", name: "Formation", image: null },
    ];
    const result = buildProductPerformance([
      { status: "completed", net_amount: 3000, currency: "XOF", product_id: "p1" },
      { status: "settled", net_amount: 2, currency: "EUR", product_id: "p1" },
      { status: "failed", net_amount: 9999, currency: "XOF", product_id: "p1" },
      { status: "completed", net_amount: 10, currency: "NGN", product_id: "p2" },
    ], products, "XOF");

    expect(result).toEqual([
      { id: "p1", name: "Livre", image: null, sales: 2, revenueNet: 4311.91 },
      { id: "p2", name: "Formation", image: null, sales: 1, revenueNet: null },
    ]);
  });
});
