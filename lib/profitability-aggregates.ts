import { isConfirmedChariowSaleStatus } from "@/lib/chariow/sales";
import { convertCurrency } from "@/lib/currency";

export type ProfitabilityAggregate = {
  spend: number;
  completedSales: number;
  abandonedSales: number;
  failedSales: number;
  grossRevenue: number | null;
  netRevenue: number | null;
  revenueByCurrency: Array<{ currency: string; sales: number; grossRevenue: number; netRevenue: number }>;
  currency: string | null;
  abandonmentRate: number | null;
  failureRate: number | null;
  /** Coût par vente : dépenses / ventes reliées aux campagnes Vendeo, dans la devise des dépenses. */
  costPerSale: number | null;
  /** @deprecated Alias de costPerSale, conservé pour les consommateurs existants. */
  cac: number | null;
  vendeoAttributedRoas: number | null;
  /** Rentabilité en % (vendeoAttributedRoas x 100). */
  profitabilityPct: number | null;
};

/**
 * `sales` doit déjà être limité aux ventes reliées aux campagnes Vendeo (ou `linkedSales` doit
 * être fourni). Ne jamais passer toutes les ventes de la boutique pour calculer un coût par vente.
 */
export function calculateProfitabilityAggregate(input: {
  spend: number;
  spendCurrency?: string | null;
  sales: Array<{ status?: string | null; amount?: number | string | null; net_amount?: number | string | null; currency?: string | null }>;
  /** Nombre de ventes confirmées reliées aux campagnes Vendeo. Par défaut : les ventes confirmées de `sales`. */
  linkedSales?: number;
  attributedNetRevenue?: number;
  attributedCurrency?: string | null;
}): ProfitabilityAggregate {
  const confirmed = input.sales.filter((sale) => isConfirmedChariowSaleStatus(sale.status));
  const abandoned = input.sales.filter((sale) => sale.status === "abandoned" || sale.status === "abandoned.sale");
  const failed = input.sales.filter((sale) => sale.status === "failed" || sale.status === "failed.sale");
  const byCurrency = new Map<string, { currency: string; sales: number; grossRevenue: number; netRevenue: number }>();
  for (const sale of confirmed) {
    const currency = typeof sale.currency === "string" && sale.currency.trim() ? sale.currency.trim().toUpperCase() : "UNKNOWN";
    const bucket = byCurrency.get(currency) ?? { currency, sales: 0, grossRevenue: 0, netRevenue: 0 };
    bucket.sales += 1;
    bucket.grossRevenue += Number(sale.amount ?? 0);
    bucket.netRevenue += Number(sale.net_amount ?? 0);
    byCurrency.set(currency, bucket);
  }
  const revenueByCurrency = [...byCurrency.values()].map((bucket) => ({
    ...bucket,
    grossRevenue: Math.round(bucket.grossRevenue * 100) / 100,
    netRevenue: Math.round(bucket.netRevenue * 100) / 100,
  }));
  const singleKnownCurrency = revenueByCurrency.length === 1 && revenueByCurrency[0].currency !== "UNKNOWN";
  const currency = singleKnownCurrency ? revenueByCurrency[0].currency : null;
  const grossRevenue = singleKnownCurrency ? revenueByCurrency[0].grossRevenue : null;
  const netRevenue = singleKnownCurrency ? revenueByCurrency[0].netRevenue : null;
  const spendCurrency = input.spendCurrency?.trim().toUpperCase() || null;
  const attempts = confirmed.length + abandoned.length + failed.length;

  // Revenu relié, converti dans la devise des dépenses (taux fixe de lib/currency.ts).
  // Sans devise connue ou convertible : null, jamais de ratio entre devises différentes.
  const toSpendCurrency = (amount: number, from: string | null): number | null => {
    if (!spendCurrency || !from) return null;
    return from === spendCurrency ? amount : convertCurrency(amount, from, spendCurrency);
  };
  const comparableAttributedRevenue = input.attributedNetRevenue !== undefined
    ? toSpendCurrency(input.attributedNetRevenue, input.attributedCurrency?.trim().toUpperCase() || null)
    : netRevenue !== null ? toSpendCurrency(netRevenue, currency) : null;

  const linkedSales = input.linkedSales ?? confirmed.length;
  const costPerSale = spendCurrency && linkedSales > 0 ? input.spend / linkedSales : null;
  const roas = input.spend > 0 && comparableAttributedRevenue !== null ? comparableAttributedRevenue / input.spend : null;

  return {
    spend: input.spend,
    completedSales: confirmed.length,
    abandonedSales: abandoned.length,
    failedSales: failed.length,
    grossRevenue,
    netRevenue,
    revenueByCurrency,
    currency,
    abandonmentRate: attempts > 0 ? abandoned.length / attempts : null,
    failureRate: attempts > 0 ? failed.length / attempts : null,
    costPerSale,
    cac: costPerSale,
    vendeoAttributedRoas: roas,
    profitabilityPct: roas === null ? null : Math.round(roas * 1000) / 10,
  };
}
