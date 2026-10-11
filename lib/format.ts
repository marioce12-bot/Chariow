import { toUsd } from "./currency";

export function formatMoney(value: number | null, currency = "XOF"): string {
  if (value === null || !Number.isFinite(value)) return "n/d";
  const code = currency.trim().toUpperCase();
  return `${Math.round(value).toLocaleString("fr-FR")} ${code}`;
}

/** Affiche une somme convertie en USD, ou null si la conversion est impossible. */
export function formatMoneyInUSD(value: number | null | undefined, currency: string): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const converted = toUsd(value, currency);
  if (converted === null) return null;
  const approximate = currency.trim().toUpperCase() === "USD" ? "" : "≈ ";
  return `${approximate}${formatMoney(converted, "USD")}`;
}
