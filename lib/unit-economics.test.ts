import { describe, expect, it } from "vitest";
import {
  abandonmentRate,
  aggregateCustomers,
  costPerSale,
  customerValue,
  DEFAULT_TARGET_MARGIN,
  health,
  isLowData,
  maxCostPerCustomer,
  overviewState,
  paybackDays,
  profit,
  profitabilityPct,
  repeatRate,
} from "./unit-economics";
import { missingCustomerSales, mixedCurrencySales, repeatBuyersSales, singleCustomerSales, stateASales, stateDSales, twoStoresSales } from "../tests/fixtures/unit-economics";

describe("profit et rentabilité", () => {
  it("calcule le bénéfice et la rentabilité en %", () => {
    expect(profit(150, 100)).toBe(50);
    expect(profitabilityPct(150, 100)).toBe(150);
  });

  it("renvoie null sans dépenses ou sans donnée", () => {
    expect(profit(150, 0)).toBeNull();
    expect(profitabilityPct(150, 0)).toBeNull();
    expect(profitabilityPct(null, 100)).toBeNull();
    expect(profit(undefined, 100)).toBeNull();
  });

  it("zéro revenu relié avec des dépenses : rentabilité 0 %, perte égale aux dépenses", () => {
    expect(profitabilityPct(0, 100)).toBe(0);
    expect(profit(0, 100)).toBe(-100);
  });
});

describe("costPerSale", () => {
  it("divise uniquement par les ventes reliées", () => {
    expect(costPerSale(100, 4)).toBe(25);
  });

  it("renvoie null sans vente reliée (zéro vente)", () => {
    expect(costPerSale(100, 0)).toBeNull();
    expect(costPerSale(100, null)).toBeNull();
  });

  it("zéro dépense avec ventes reliées : coût 0", () => {
    expect(costPerSale(0, 3)).toBe(0);
  });
});

describe("plafond par client", () => {
  it("applique la marge cible", () => {
    expect(maxCostPerCustomer(10000, 0.3)).toBe(7000);
    expect(maxCostPerCustomer(10000)).toBe(10000 * (1 - DEFAULT_TARGET_MARGIN));
  });

  it("refuse une marge invalide ou une valeur nulle", () => {
    expect(maxCostPerCustomer(10000, 1)).toBeNull();
    expect(maxCostPerCustomer(10000, -0.1)).toBeNull();
    expect(maxCostPerCustomer(0, 0.3)).toBeNull();
    expect(maxCostPerCustomer(null, 0.3)).toBeNull();
  });
});

describe("valeur client, rachats, fiabilité", () => {
  it("état A : valeur client et taux de rachat sur l'historique boutique", () => {
    const stats = aggregateCustomers(stateASales, "XOF");
    expect(stats.customers).toBe(3);
    expect(stats.netByCustomer).toEqual([17000, 17000, 8500]);
    expect(customerValue(stats.netByCustomer)).toBeCloseTo(14166.67, 2);
    expect(repeatRate(stats.ordersByCustomer)).toBeCloseTo(1 / 3, 5);
    expect(isLowData(stats.customers)).toBe(true);
  });

  it("état D : aucune vente confirmée, rien à calculer", () => {
    const stats = aggregateCustomers(stateDSales, "XOF");
    expect(stats.customers).toBe(0);
    expect(customerValue(stats.netByCustomer)).toBeNull();
    expect(repeatRate(stats.ordersByCustomer)).toBeNull();
  });

  it("un seul client : valeur client calculée, mais peu de données", () => {
    const stats = aggregateCustomers(singleCustomerSales, "XOF");
    expect(customerValue(stats.netByCustomer)).toBe(10000);
    expect(repeatRate(stats.ordersByCustomer)).toBe(0);
    expect(isLowData(stats.customers)).toBe(true);
  });

  it("rachats multiples", () => {
    const stats = aggregateCustomers(repeatBuyersSales, "XOF");
    expect(stats.ordersByCustomer.sort()).toEqual([1, 2, 3]);
    expect(repeatRate(stats.ordersByCustomer)).toBeCloseTo(2 / 3, 5);
  });

  it("le seuil de fiabilité est de 30 clients", () => {
    expect(isLowData(29)).toBe(true);
    expect(isLowData(30)).toBe(false);
  });

  it("un même customer.id dans deux boutiques donne deux clients", () => {
    expect(aggregateCustomers(twoStoresSales, "XOF").customers).toBe(2);
  });

  it("compte à part les ventes sans customer_id", () => {
    const stats = aggregateCustomers(missingCustomerSales, "XOF");
    expect(stats.withoutCustomer).toBe(1);
    expect(stats.customers).toBe(1);
  });

  it("devises mixtes : convertit ce qui peut l'être et ignore le reste", () => {
    const stats = aggregateCustomers(mixedCurrencySales, "XOF");
    expect(stats.skippedSales).toBe(2);
    expect(stats.customers).toBe(1);
    expect(stats.netByCustomer[0]).toBeCloseTo(6559.57 * 2, 0);
    expect(customerValue(stats.netByCustomer)).toBeNull();
  });
});

describe("abandon", () => {
  it("calcule le taux d'abandon", () => {
    expect(abandonmentRate({ completed: 2, abandoned: 1, failed: 1 })).toBeCloseTo(0.25, 5);
  });
  it("renvoie null sans tentative", () => {
    expect(abandonmentRate({ completed: 0, abandoned: 0, failed: 0 })).toBeNull();
  });
});

describe("santé face au plafond", () => {
  it("classe Sain, Limite, Critique", () => {
    expect(health(5000, 10000)).toBe("healthy");
    expect(health(8000, 10000)).toBe("healthy");
    expect(health(9000, 10000)).toBe("limit");
    expect(health(10000, 10000)).toBe("limit");
    expect(health(12000, 10000)).toBe("critical");
  });
  it("renvoie null sans plafond ou sans coût", () => {
    expect(health(null, 10000)).toBeNull();
    expect(health(5000, null)).toBeNull();
    expect(health(5000, 0)).toBeNull();
  });
});

describe("récupération (payback)", () => {
  it("renvoie le premier jour où les ventes reliées couvrent les dépenses", () => {
    expect(paybackDays({ spend: 100, linkedSales: [{ daysSinceLaunch: 1, netRevenue: 40 }, { daysSinceLaunch: 3.2, netRevenue: 70 }] })).toBe(4);
  });
  it("renvoie null sans dépenses, sans ventes reliées ou si non couvert", () => {
    expect(paybackDays({ spend: 0, linkedSales: [{ daysSinceLaunch: 1, netRevenue: 40 }] })).toBeNull();
    expect(paybackDays({ spend: 100, linkedSales: [] })).toBeNull();
    expect(paybackDays({ spend: 100, linkedSales: [{ daysSinceLaunch: 1, netRevenue: 40 }] })).toBeNull();
  });
});

describe("états de l'écran", () => {
  it("A : ventes, aucune pub Vendeo", () => {
    expect(overviewState({ confirmedSales: 448, vendeoCampaigns: 0, linkedSales: 0 })).toBe("A");
  });
  it("B : pub lancée, aucune vente reliée", () => {
    expect(overviewState({ confirmedSales: 448, vendeoCampaigns: 1, linkedSales: 0 })).toBe("B");
    expect(overviewState({ confirmedSales: 0, vendeoCampaigns: 1, linkedSales: 0 })).toBe("B");
  });
  it("C : pub et ventes reliées", () => {
    expect(overviewState({ confirmedSales: 448, vendeoCampaigns: 2, linkedSales: 5 })).toBe("C");
  });
  it("D : aucune vente", () => {
    expect(overviewState({ confirmedSales: 0, vendeoCampaigns: 0, linkedSales: 0 })).toBe("D");
  });
});
