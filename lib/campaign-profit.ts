import { aggregateProductProfit, type ProductCost, type ProductSales } from "./product-profit-math";
import { isConfirmedChariowSaleStatus } from "./chariow/sales";
export type Recommendation = "continue" | "reduce" | "increase" | "unknown";
export type CampaignProfitInput = {
  id: string; name: string; currency: string; spend: number | null;
  sales: ProductSales[]; costs: ProductCost[];
  mappingReliable: boolean; attributionReliable: boolean; spendComplete: boolean; salesComplete: boolean;
};
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function calculateCampaignProfit(input: CampaignProfitInput) {
  const relevant = input.sales.filter(s => isConfirmedChariowSaleStatus(s.status) || /refund|chargeback/i.test(s.status));
  const rowsValid = relevant.every(s => !!s.product_id?.trim() && !!s.currency && s.currency.toUpperCase() === input.currency && !!input.currency);
  const products = aggregateProductProfit(relevant, input.costs);
  const netKnown = rowsValid && products.every(p => p.netRevenue != null);
  const feesKnown = rowsValid && products.every(p => p.chariowFees != null);
  const estimated = products.some(p => p.estimatedNetRevenue);
  const net = netKnown ? round(products.reduce((n, p) => n + (p.netRevenue ?? 0), 0)) : null;
  const fees = feesKnown ? round(products.reduce((n, p) => n + (p.chariowFees ?? 0), 0)) : null;
  const unitCosts = rowsValid ? round(products.reduce((n, p) => n + p.totalCosts, 0)) : null;
  const sales = products.reduce((n, p) => n + p.units, 0);
  const refunds = products.reduce((n, p) => n + p.refunds, 0);
  const reasons: string[] = [];
  if (!input.mappingReliable || !input.attributionReliable) reasons.push("Le rapprochement entre les ventes Chariow et cette campagne Meta n’est pas encore vérifié dans Vendeo. Cela ne signifie pas que le pixel est mal installé.");
  if (!input.spendComplete || input.spend == null || !Number.isFinite(input.spend)) reasons.push("Dépenses ou couverture de synchronisation Meta incomplètes.");
  if (!input.salesComplete) reasons.push("Historique des ventes incomplet ou périmé pour la période.");
  if (!rowsValid) reasons.push("Produit ou devise manquant/incompatible : aucun montant n’est supprimé silencieusement.");
  if (!netKnown || !feesKnown) reasons.push("Net encaissé/frais réels incomplets.");
  if (estimated) reasons.push("Net estimé à partir des frais Chariow de 15 %, pas un règlement net confirmé.");
  const financialReady = input.mappingReliable && input.attributionReliable && input.spendComplete && input.salesComplete && netKnown && unitCosts != null && input.spend != null && Number.isFinite(input.spend);
  const profit = financialReady ? round(net! - unitCosts! - input.spend!) : null;
  const gross = rowsValid && products.every(p => p.grossRevenue != null) ? round(products.reduce((n,p) => n + (p.grossRevenue ?? 0),0)) : null;
  const cpa = financialReady && sales > 0 ? round(input.spend! / sales) : null;
  const cpaThreshold = financialReady && !estimated && sales > 0 && net != null && unitCosts != null ? round((net - unitCosts) / sales) : null;
  let recommendation: Recommendation = "unknown";
  let recommendationReason = "Données incomplètes : vérifier le suivi avant de modifier le budget.";
  if (financialReady && !estimated && cpaThreshold != null && cpaThreshold > 0 && cpa != null) {
    recommendation = cpa > cpaThreshold ? "reduce" : sales >= 5 && cpa <= cpaThreshold * 0.7 ? "increase" : "continue";
    recommendationReason = `CPA observé ${cpa} ${input.currency} contre seuil de rentabilité ${cpaThreshold} ${input.currency}, sur ${sales} vente(s) payée(s).${sales < 5 ? " Échantillon limité : aucune augmentation recommandée." : ""}`;
  }
  return { id: input.id, name: input.name, currency: input.currency, sales, refunds, gross, net: input.salesComplete && rowsValid ? net : null, fees: input.salesComplete && rowsValid ? fees : null, unitCosts: input.salesComplete ? unitCosts : null, spend: input.spend, profit, margin: profit != null && gross != null && gross > 0 ? round(profit / gross * 100) : null, cpa, cpaThreshold, estimated, recommendation, recommendationReason, reasons, productIds: [...new Set(relevant.map(s=>s.product_id).filter((id): id is string=>!!id))] };
}
export function confidenceFromAttributions(rows: Array<{ chariow_sale_id: string | null; meta_campaign_id: string | null; attribution_method?: string | null; attribution_confidence?: number | null }>) {
  const campaigns = new Map<string, Set<string>>();
  const eligible = new Set<string>();
  for (const row of rows) {
    if (!row.chariow_sale_id || !row.meta_campaign_id) continue;
    const set = campaigns.get(row.chariow_sale_id) ?? new Set<string>();
    set.add(row.meta_campaign_id); campaigns.set(row.chariow_sale_id, set);
    if (["utm", "click_id", "sale_metadata"].includes(row.attribution_method ?? "") && row.attribution_confidence != null && Number(row.attribution_confidence) >= 80) eligible.add(row.chariow_sale_id);
  }
  const unique = new Set([...eligible].filter(id => campaigns.get(id)?.size === 1));
  return { reliable: unique.size > 0 && unique.size === campaigns.size, saleIds: unique };
}
