export type Health = "sain" | "limite" | "critique";

export function profit(netRevenue: number | null, spend: number | null): number | null {
  if (netRevenue === null || spend === null || !Number.isFinite(netRevenue) || !Number.isFinite(spend)) return null;
  return netRevenue - spend;
}

export function profitabilityPct(netRevenue: number | null, spend: number | null): number | null {
  if (netRevenue === null || spend === null || !Number.isFinite(netRevenue) || !Number.isFinite(spend) || spend <= 0) return null;
  return ((netRevenue - spend) / spend) * 100;
}

export function costPerSale(spend: number | null, confirmedSales: number | null): number | null {
  if (spend === null || confirmedSales === null || !Number.isFinite(spend) || !Number.isFinite(confirmedSales) || confirmedSales <= 0) return null;
  return spend / confirmedSales;
}

export function maxCostPerCustomer(netPrice: number | null, fees: number | null, targetMargin = 0.3): number | null {
  if (netPrice === null || fees === null || !Number.isFinite(netPrice) || !Number.isFinite(fees) || !Number.isFinite(targetMargin)) return null;
  return Math.max(0, netPrice - fees - netPrice * targetMargin);
}

export function health(cost: number | null, maxCost: number | null): Health | null {
  if (cost === null || maxCost === null || !Number.isFinite(cost) || !Number.isFinite(maxCost) || maxCost <= 0) return null;
  if (cost <= maxCost * 0.8) return "sain";
  if (cost <= maxCost) return "limite";
  return "critique";
}

export function customerValue(netRevenue: number | null, customerCount: number | null): number | null {
  if (netRevenue === null || customerCount === null || customerCount <= 0) return null;
  return netRevenue / customerCount;
}

export function paybackDays(cost: number | null, dailyContribution: number | null): number | null {
  if (cost === null || dailyContribution === null || cost < 0 || dailyContribution <= 0) return null;
  return cost / dailyContribution;
}
