import { describe, expect, it } from "vitest";
import { buildOverviewAggregates, daysBetween } from "./overview-aggregates";
import { mixedCurrencySales, repeatBuyersSales, stateASales, stateDSales } from "@/tests/fixtures/unit-economics";

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
});
