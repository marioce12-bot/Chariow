import { toUsd } from "./currency";

// Devises sans centimes (unité minimale = 1) : on les affiche en nombres entiers, comme avant.
const ZERO_DECIMAL_CURRENCIES = new Set([
  "XOF", "XAF", "JPY", "KRW", "GNF", "RWF", "UGX", "VND", "CLP", "PYG", "BIF", "DJF", "KMF", "MGA", "VUV", "XPF",
]);

/**
 * Formate un montant. Les devises sans centimes (XOF, XAF…) sont arrondies à l'entier ;
 * les autres (USD, EUR…) gardent jusqu'à 2 décimales : 2,63 USD ne devient plus « 3 USD ».
 * Un montant rond reste affiché sans décimales (10 USD).
 */
export function formatMoney(value: number | null, currency = "XOF"): string {
  if (value === null || !Number.isFinite(value)) return "n/d";
  const code = currency.trim().toUpperCase();
  if (ZERO_DECIMAL_CURRENCIES.has(code)) return `${Math.round(value).toLocaleString("fr-FR")} ${code}`;
  const rounded = Math.round(value * 100) / 100;
  return `${rounded.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${code}`;
}

/** Affiche une somme convertie en USD, ou null si la conversion est impossible. */
export function formatMoneyInUSD(value: number | null | undefined, currency: string): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const converted = toUsd(value, currency);
  if (converted === null) return null;
  const approximate = currency.trim().toUpperCase() === "USD" ? "" : "≈ ";
  return `${approximate}${formatMoney(converted, "USD")}`;
}
