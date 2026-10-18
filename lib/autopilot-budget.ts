/** Pure validation and fail-closed daily budget guard. */
export type BudgetLimit = { budget_limit: number | null; currency: string | null };
export type BudgetGuardResult = { allowed: boolean; reason: "NO_BUDGET_LIMIT" | "CURRENCY_UNAVAILABLE" | "CURRENCY_MISMATCH" | "BUDGET_EXCEEDED" | null };

/** ISO-4217 fraction digits as implemented by the runtime's Intl data (0–3); null for invalid codes. */
export function currencyFractionDigits(currency: string): number | null {
  if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency)) return null;
  if (!Intl.supportedValuesOf("currency").includes(currency.toUpperCase())) return null;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currency.toUpperCase() }).resolvedOptions().maximumFractionDigits ?? null;
  } catch { return null; }
}

export function validateBudgetLimit(value: unknown, currency = "USD"): value is number | null {
  if (value === null) return true;
  const digits = currencyFractionDigits(currency);
  if (digits === null || typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value >= 1_000_000_000_000_000) return false;
  const factor = 10 ** digits;
  return Number.isSafeInteger(Math.round(value * factor)) && Math.abs(value * factor - Math.round(value * factor)) < 1e-7;
}

export function guardPlannedDailyBudget(input: {
  plannedDailyBudget: number | null;
  plannedCurrency: string | null;
  budgetLimit: number | null;
  limitCurrency: string | null;
  campaignCurrency: string | null;
}): BudgetGuardResult {
  if (input.budgetLimit === null) return { allowed: false, reason: "NO_BUDGET_LIMIT" };
  const curr = input.campaignCurrency?.trim().toUpperCase();
  if (!curr || !input.limitCurrency?.trim() || currencyFractionDigits(curr) === null) return { allowed: false, reason: "CURRENCY_UNAVAILABLE" };
  if (!validateBudgetLimit(input.budgetLimit, curr)) return { allowed: false, reason: "NO_BUDGET_LIMIT" };
  if (curr !== input.limitCurrency.trim().toUpperCase() || input.plannedCurrency?.trim().toUpperCase() !== curr)
    return { allowed: false, reason: "CURRENCY_MISMATCH" };
  if (input.plannedDailyBudget === null || !Number.isFinite(input.plannedDailyBudget) || input.plannedDailyBudget <= 0)
    return { allowed: false, reason: "CURRENCY_UNAVAILABLE" };
  if (input.plannedDailyBudget > input.budgetLimit) return { allowed: false, reason: "BUDGET_EXCEEDED" };
  return { allowed: true, reason: null };
}
