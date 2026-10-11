import { describe, expect, it } from "vitest";
import { costPerSale, customerValue, health, maxCostPerCustomer, paybackDays, profit, profitabilityPct } from "./unit-economics";

describe("unit economics", () => {
  it("calcule bénéfice et rentabilité sans mélanger les devises", () => {
    expect(profit(150, 50)).toBe(100);
    expect(profitabilityPct(150, 50)).toBe(200);
    expect(profitabilityPct(150, 0)).toBeNull();
  });
  it("calcule le coût par vente uniquement avec des ventes confirmées", () => {
    expect(costPerSale(100, 4)).toBe(25);
    expect(costPerSale(100, 0)).toBeNull();
  });
  it("calcule le plafond et la santé", () => {
    expect(maxCostPerCustomer(100, 10, 0.3)).toBe(60);
    expect(health(40, 60)).toBe("sain");
    expect(health(54, 60)).toBe("limite");
    expect(health(61, 60)).toBe("critique");
  });
  it("ne présente valeur client et récupération que sur données fiables", () => {
    expect(customerValue(300, 3)).toBe(100);
    expect(customerValue(300, 0)).toBeNull();
    expect(paybackDays(100, 20)).toBe(5);
    expect(paybackDays(100, 0)).toBeNull();
  });
});
