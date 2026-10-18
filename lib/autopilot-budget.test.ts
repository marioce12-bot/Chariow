import { describe, expect, it } from "vitest";
import { currencyFractionDigits, guardPlannedDailyBudget, validateBudgetLimit } from "./autopilot-budget";

describe("autopilot budget limit", () => {
  it("accepts null or positive finite amounts with at most two decimals", () => {
    expect(validateBudgetLimit(null)).toBe(true);
    expect(validateBudgetLimit(12.34)).toBe(true);
    for (const value of [0, -1, NaN, Infinity, "12", 1.234]) expect(validateBudgetLimit(value)).toBe(false);
    expect(currencyFractionDigits("JPY")).toBe(0);
    expect(validateBudgetLimit(100, "JPY")).toBe(true);
    expect(validateBudgetLimit(100.5, "JPY")).toBe(false);
  });
  it("fails closed without cap or reliable matching currencies", () => {
    const base = { plannedDailyBudget: 5, plannedCurrency: "EUR", budgetLimit: 10, limitCurrency: "EUR", campaignCurrency: "EUR" };
    expect(guardPlannedDailyBudget({ ...base, budgetLimit: null }).reason).toBe("NO_BUDGET_LIMIT");
    expect(guardPlannedDailyBudget({ ...base, campaignCurrency: null }).reason).toBe("CURRENCY_UNAVAILABLE");
    expect(guardPlannedDailyBudget({ ...base, plannedCurrency: "USD" }).reason).toBe("CURRENCY_MISMATCH");
    expect(guardPlannedDailyBudget({ ...base, plannedDailyBudget: 11 }).reason).toBe("BUDGET_EXCEEDED");
    expect(guardPlannedDailyBudget({ ...base, budgetLimit: NaN }).allowed).toBe(false);
    expect(guardPlannedDailyBudget({ ...base, budgetLimit: Infinity }).allowed).toBe(false);
    expect(guardPlannedDailyBudget(base)).toEqual({ allowed: true, reason: null });
  });
});
