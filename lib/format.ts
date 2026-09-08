export function formatMoney(value: number | null, currency = "XOF"): string {
  if (value === null || !Number.isFinite(value)) return "n/d";
  return `${Math.round(value).toLocaleString("fr-FR")} ${currency}`;
}
