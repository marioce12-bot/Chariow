// Conversion de devise → dollars US (devise des comptes publicitaires Meta/TikTok
// de Vendeo). Taux FIXES pour l'instant : le XOF et le XAF sont arrimés à l'euro
// (1 EUR = 655,957 F CFA), seul EUR → USD varie. À remplacer plus tard par un taux
// en direct (API de taux de change + cache) sans changer la signature de toUsd().
const FCFA_PER_EUR = 655.957;
// Taux EUR → USD de repli, ajustable sans redéploiement de code via FX_USD_PER_EUR.
const DEFAULT_USD_PER_EUR = 1.17;

function usdPerEur(): number {
  const fromEnv = Number(process.env.FX_USD_PER_EUR);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_USD_PER_EUR;
}

// Devises supplémentaires optionnelles : FX_EXTRA_USD_RATES='{"NGN":0.00065,"GHS":0.065}'
// (valeur d'UNE unité de la devise, en dollars).
function extraRates(): Record<string, number> {
  try {
    const parsed = JSON.parse(process.env.FX_EXTRA_USD_RATES ?? "{}") as Record<string, unknown>;
    const rates: Record<string, number> = {};
    for (const [code, value] of Object.entries(parsed)) {
      const rate = Number(value);
      if (Number.isFinite(rate) && rate > 0) rates[code.toUpperCase()] = rate;
    }
    return rates;
  } catch {
    return {};
  }
}

/** Valeur d'une unité de `currency` en dollars US, ou null si la devise n'est pas prise en charge. */
export function usdPerUnit(currency: string): number | null {
  const code = currency.trim().toUpperCase();
  if (code === "USD" || code === "$") return 1;
  if (code === "EUR") return usdPerEur();
  if (code === "XOF" || code === "XAF" || code === "FCFA" || code === "CFA") return usdPerEur() / FCFA_PER_EUR;
  return extraRates()[code] ?? null;
}

/** Convertit un montant en dollars US (arrondi au centime). Renvoie null si la devise est inconnue. */
export function toUsd(amount: number, currency: string): number | null {
  const rate = usdPerUnit(currency);
  if (rate === null || !Number.isFinite(amount)) return null;
  return Math.round(amount * rate * 100) / 100;
}
