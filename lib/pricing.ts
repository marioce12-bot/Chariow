// Moteur de recommandation de prix — Vendeo.
//
// Vendeo n'est plus seulement un lecteur de campagnes : sur les produits qui se
// vendent déjà bien, il dit aussi si une légère hausse de prix est probablement
// possible sans perdre de volume. La règle est volontairement simple et
// transparente (pas de boîte noire) : on ne recommande un test de prix que si
// - le produit a déjà un nombre minimum de ventes confirmées par Chariow,
// - le taux d'abandon observé autour de ce produit reste faible (peu de signal
//   que le prix actuel bloque déjà des acheteurs).
// Tant qu'aucune donnée de coût produit n'est disponible, l'estimation de marge
// supplémentaire reste indicative : elle sert à orienter la décision, pas à la
// garantir. Cette limite est assumée dans le texte de la recommandation.

export type PricingProductInput = {
  id: string;
  name: string;
  price: number | string | null;
  currency: string | null;
  sales: number | null;
};

export type PricingOpportunity = {
  productId: string;
  productName: string;
  currentPrice: number;
  currency: string;
  suggestedPrice: number;
  suggestedIncreasePercent: number;
  completedSales: number;
  abandonedSales: number;
  abandonRate: number;
  projectedExtraRevenue: number;
  reasoning: string;
};

// Un produit doit avoir au moins ce nombre de ventes confirmées avant que
// Vendeo ne propose de tester une hausse de prix : sous ce seuil, le signal
// est trop faible pour être fiable.
const MIN_COMPLETED_SALES_FOR_PRICE_TEST = 2;

// Si plus de la moitié des tentatives d'achat observées autour d'un produit
// sont abandonnées ou restent en attente de paiement, on considère que le prix
// (ou le tunnel de paiement) est déjà un frein : ce n'est pas le moment de le
// monter.
const MAX_ABANDON_RATE_FOR_PRICE_TEST = 0.5;

// Palier de test volontairement modéré : +8 %, assez pour dégager de la marge,
// assez faible pour ne pas casser la conversion actuelle.
const SUGGESTED_PRICE_INCREASE_RATIO = 0.08;

const ABANDON_LIKE_STATUSES = new Set(["abandoned", "awaiting_payment", "cart_abandoned"]);
const COMPLETED_LIKE_STATUSES = new Set(["completed", "settled", "paid"]);

function readSaleField(row: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function readSaleProductName(row: Record<string, unknown>): string | undefined {
  const direct = readSaleField(row, ["product_name", "productName"]);
  if (direct) return direct;
  const product = row.product;
  if (product && typeof product === "object") {
    return readSaleField(product as Record<string, unknown>, ["name"]);
  }
  return undefined;
}

function readSaleStatus(row: Record<string, unknown>): string {
  return String(row.status ?? row.state ?? "unknown");
}

function toNumber(value: unknown): number {
  const numeric = typeof value === "object" && value !== null ? Number((value as Record<string, unknown>).value ?? (value as Record<string, unknown>).amount) : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * Calcule, pour chaque produit du catalogue Chariow, si une hausse de prix
 * modérée est probablement possible — avec une estimation chiffrée de la
 * marge supplémentaire — en croisant le catalogue avec l'historique des
 * ventes (statuts confirmés vs abandonnés).
 *
 * Trié du plus prometteur (marge supplémentaire estimée) au moins prometteur.
 */
export function getPricingOpportunities(products: PricingProductInput[], sales: unknown[]): PricingOpportunity[] {
  const rows = sales
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
    .filter((item): item is Record<string, unknown> => item !== null);

  const opportunities: PricingOpportunity[] = [];

  for (const product of products) {
    const price = toNumber(product.price);
    if (price <= 0) continue;

    const matchingRows = rows.filter((row) => readSaleProductName(row) === product.name);
    const completedFromSales = matchingRows.filter((row) => COMPLETED_LIKE_STATUSES.has(readSaleStatus(row))).length;
    const abandoned = matchingRows.filter((row) => ABANDON_LIKE_STATUSES.has(readSaleStatus(row))).length;

    // On retombe sur le compteur agrégé du catalogue si l'historique détaillé
    // des ventes n'a pas encore été synchronisé pour ce produit.
    const completed = completedFromSales > 0 ? completedFromSales : product.sales ?? 0;
    if (completed < MIN_COMPLETED_SALES_FOR_PRICE_TEST) continue;

    const totalObserved = completed + abandoned;
    const abandonRate = totalObserved > 0 ? abandoned / totalObserved : 0;
    if (totalObserved > 0 && abandonRate > MAX_ABANDON_RATE_FOR_PRICE_TEST) continue;

    const currency = product.currency ?? "XOF";
    const suggestedPrice = Math.round(price * (1 + SUGGESTED_PRICE_INCREASE_RATIO));
    const projectedExtraRevenue = Math.round(completed * price * SUGGESTED_PRICE_INCREASE_RATIO);

    const reasoning = abandoned > 0
      ? `${completed} vente${completed > 1 ? "s" : ""} confirmée${completed > 1 ? "s" : ""} et seulement ${Math.round(abandonRate * 100)} % d’abandons observés autour de ce produit : la demande ne semble pas très sensible au prix actuel.`
      : `${completed} vente${completed > 1 ? "s" : ""} confirmée${completed > 1 ? "s" : ""} sans signal d’abandon détecté : ce produit peut probablement supporter un prix légèrement plus élevé.`;

    opportunities.push({
      productId: product.id,
      productName: product.name,
      currentPrice: price,
      currency,
      suggestedPrice,
      suggestedIncreasePercent: SUGGESTED_PRICE_INCREASE_RATIO * 100,
      completedSales: completed,
      abandonedSales: abandoned,
      abandonRate,
      projectedExtraRevenue,
      reasoning,
    });
  }

  return opportunities.sort((a, b) => b.projectedExtraRevenue - a.projectedExtraRevenue);
}
