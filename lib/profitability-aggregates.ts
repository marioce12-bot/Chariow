export type ProfitabilityAggregate = {
  spend: number;
  completedSales: number;
  abandonedSales: number;
  failedSales: number;
  grossRevenue: number;
  netRevenue: number;
  abandonmentRate: number | null;
  failureRate: number | null;
  cac: number | null;
  vendeoAttributedRoas: number | null;
};

export function calculateProfitabilityAggregate(input: { spend: number; sales: Array<{ status?: string | null; amount?: number | string | null; net_amount?: number | string | null }>; attributedNetRevenue?: number }) : ProfitabilityAggregate {
  const completed = input.sales.filter((sale) => sale.status === "completed");
  const abandoned = input.sales.filter((sale) => sale.status === "abandoned" || sale.status === "abandoned.sale");
  const failed = input.sales.filter((sale) => sale.status === "failed" || sale.status === "failed.sale");
  const grossRevenue = completed.reduce((sum, sale) => sum + Number(sale.amount ?? 0), 0);
  const netRevenue = completed.reduce((sum, sale) => sum + Number(sale.net_amount ?? 0), 0);
  const attempts = completed.length + abandoned.length + failed.length;
  return { spend: input.spend, completedSales: completed.length, abandonedSales: abandoned.length, failedSales: failed.length, grossRevenue, netRevenue, abandonmentRate: attempts > 0 ? abandoned.length / attempts : null, failureRate: attempts > 0 ? failed.length / attempts : null, cac: completed.length > 0 ? input.spend / completed.length : null, vendeoAttributedRoas: input.spend > 0 ? (input.attributedNetRevenue ?? netRevenue) / input.spend : null };
}
