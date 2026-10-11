import { describe, expect, it } from "vitest";
import { convertCurrency } from "./currency";
import { formatMoneyInUSD } from "./format";

describe("convertCurrency", () => {
  it("convertit le XOF vers l'EUR via la parité fixe CFA/euro", () => {
    expect(convertCurrency(655957, "XOF", "EUR")).toBe(1000);
  });

  it("ne calcule pas de montant pour une devise non prise en charge", () => {
    expect(convertCurrency(100, "XYZ", "USD")).toBeNull();
    expect(convertCurrency(100, "USD", "XYZ")).toBeNull();
  });

  it("formate les montants convertis en USD et signale une devise inconnue", () => {
    expect(formatMoneyInUSD(0, "XOF")).toBe("≈ 0 USD");
    expect(formatMoneyInUSD(0, "USD")).toBe("0 USD");
    expect(formatMoneyInUSD(100, "XYZ")).toBeNull();
  });
});
