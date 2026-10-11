// Économie unitaire d'un client acquis par la pub (déterministe, sans IA).
// Répond à : « si mon coût d'acquisition (CAC) monte, mon modèle tient-il encore ? »
//
// Vocabulaire :
// - CAC : dépense pub moyenne pour obtenir un client qui achète.
// - CAC maximum supportable : le CAC au-delà duquel la marge minimale voulue n'est plus tenue.
// - Valeur par client : ce qu'un client rapporte. Par défaut le prix du premier achat ;
//   on pourra y brancher la LTV (valeur sur toute la relation) quand elle sera calculable.
// - Test de résistance : on augmente volontairement le CAC et on regarde ce qu'il reste.

export type StressStatus = "ok" | "tight" | "loss";

export type StressInput = {
  /** Prix du premier achat (même devise que le CAC et les frais). */
  price: number;
  /** Frais directs de vente et de transaction par commande. */
  fees: number;
  /** CAC actuel. */
  cac: number;
  /** Valeur d'un client (ex. LTV). Par défaut : le prix du premier achat. */
  valuePerCustomer?: number;
  /** Marge minimale voulue, en part de la valeur par client (0.2 = 20 %). Défaut : 0.2. */
  minMarginRate?: number;
  /** Multiplicateurs de CAC à simuler. Défaut : actuel, +25 %, +50 %, ×2. */
  multipliers?: number[];
};

export type StressRow = {
  multiplier: number;
  cac: number;
  /** Ce qu'il reste par client après CAC et frais (peut être négatif). */
  margin: number;
  /** margin / valeur par client. */
  marginRate: number;
  status: StressStatus;
};

export type StressResult = {
  valuePerCustomer: number;
  currentMargin: number;
  /** CAC maximum supportable pour tenir la marge minimale voulue. */
  maxCac: number;
  /** Part de la marge de manœuvre déjà consommée : cac / maxCac (>1 = plafond dépassé). */
  ceilingUsage: number | null;
  /** Par combien le CAC peut être multiplié avant que la marge devienne nulle (0 si déjà négative). */
  breakEvenMultiplier: number;
  rows: StressRow[];
};

const DEFAULT_MULTIPLIERS = [1, 1.25, 1.5, 2];
const DEFAULT_MIN_MARGIN_RATE = 0.2;

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function marginPerCustomer(value: number, fees: number, cac: number): number {
  return value - fees - cac;
}

export function maxSupportableCac(value: number, fees: number, minMarginRate = DEFAULT_MIN_MARGIN_RATE): number {
  return Math.max(0, value - fees - value * minMarginRate);
}

function statusOf(margin: number, cac: number, maxCac: number): StressStatus {
  if (margin < 0) return "loss";
  return cac > maxCac ? "tight" : "ok";
}

/**
 * Retourne null quand les données ne permettent pas de conclure (prix ou CAC absents / invalides) :
 * on n'invente jamais de chiffre.
 */
export function computeStressTest(input: StressInput): StressResult | null {
  const { price, fees, cac } = input;
  const value = input.valuePerCustomer ?? price;
  if (!isPositive(price) || !isPositive(cac) || !isPositive(value)) return null;
  if (typeof fees !== "number" || !Number.isFinite(fees) || fees < 0) return null;

  const minMarginRate = input.minMarginRate ?? DEFAULT_MIN_MARGIN_RATE;
  if (!Number.isFinite(minMarginRate) || minMarginRate < 0 || minMarginRate >= 1) return null;

  const multipliers = (input.multipliers ?? DEFAULT_MULTIPLIERS).filter(isPositive);
  if (!multipliers.length) return null;

  const maxCac = maxSupportableCac(value, fees, minMarginRate);
  const rows = multipliers.map((multiplier): StressRow => {
    const stressedCac = cac * multiplier;
    const margin = marginPerCustomer(value, fees, stressedCac);
    return {
      multiplier,
      cac: Math.round(stressedCac * 100) / 100,
      margin: Math.round(margin * 100) / 100,
      marginRate: margin / value,
      status: statusOf(margin, stressedCac, maxCac),
    };
  });

  return {
    valuePerCustomer: value,
    currentMargin: Math.round(marginPerCustomer(value, fees, cac) * 100) / 100,
    maxCac: Math.round(maxCac * 100) / 100,
    ceilingUsage: maxCac > 0 ? cac / maxCac : null,
    breakEvenMultiplier: Math.max(0, (value - fees) / cac),
    rows,
  };
}
