import { describe, expect, it } from "vitest";
import { computeStressTest, marginPerCustomer, maxSupportableCac } from "./unit-economics";

// Cas de référence : produit à 10 000 XOF, 500 XOF de frais, CAC à 2 500 XOF.
const base = { price: 10000, fees: 500, cac: 2500 };

describe("marginPerCustomer", () => {
  it("calcule ce qu'il reste après CAC et frais", () => {
    expect(marginPerCustomer(10000, 500, 2500)).toBe(7000);
    expect(marginPerCustomer(10000, 500, 5000)).toBe(4500);
  });
});

describe("maxSupportableCac", () => {
  it("déduit les frais et la marge minimale voulue", () => {
    // 10 000 − 500 − 20 % de 10 000 = 7 500
    expect(maxSupportableCac(10000, 500, 0.2)).toBe(7500);
  });

  it("ne descend jamais sous zéro", () => {
    expect(maxSupportableCac(1000, 900, 0.5)).toBe(0);
  });
});

describe("computeStressTest", () => {
  it("simule actuel, +25 %, +50 % et ×2 par défaut", () => {
    const result = computeStressTest(base);
    expect(result?.rows.map((row) => row.cac)).toEqual([2500, 3125, 3750, 5000]);
    expect(result?.rows.map((row) => row.margin)).toEqual([7000, 6375, 5750, 4500]);
    expect(result?.currentMargin).toBe(7000);
  });

  it("signale « serré » quand le CAC dépasse le maximum supportable mais que la marge reste positive", () => {
    const result = computeStressTest({ ...base, price: 10000, fees: 500, cac: 4000, minMarginRate: 0.5 });
    // max = 10 000 − 500 − 5 000 = 4 500 ; ×1 = 4 000 (ok), ×1.25 = 5 000 (serré)
    expect(result?.maxCac).toBe(4500);
    expect(result?.rows[0].status).toBe("ok");
    expect(result?.rows[1].status).toBe("tight");
  });

  it("signale « perte » quand la marge devient négative", () => {
    const result = computeStressTest({ price: 10000, fees: 500, cac: 6000 });
    expect(result?.rows[3].cac).toBe(12000);
    expect(result?.rows[3].status).toBe("loss");
  });

  it("donne le multiplicateur de CAC à partir duquel la marge devient nulle", () => {
    const result = computeStressTest(base);
    // (10 000 − 500) / 2 500 = 3,8
    expect(result?.breakEvenMultiplier).toBeCloseTo(3.8, 5);
  });

  it("utilise la valeur par client (ex. LTV) à la place du prix quand elle est fournie", () => {
    const result = computeStressTest({ ...base, cac: 5000, valuePerCustomer: 30000 });
    expect(result?.valuePerCustomer).toBe(30000);
    expect(result?.currentMargin).toBe(24500);
  });

  it("n'invente rien : null si prix, CAC ou frais sont absents ou invalides", () => {
    expect(computeStressTest({ ...base, cac: 0 })).toBeNull();
    expect(computeStressTest({ ...base, price: 0 })).toBeNull();
    expect(computeStressTest({ ...base, fees: -1 })).toBeNull();
    expect(computeStressTest({ ...base, cac: Number.NaN })).toBeNull();
    expect(computeStressTest({ ...base, minMarginRate: 1 })).toBeNull();
  });
});
