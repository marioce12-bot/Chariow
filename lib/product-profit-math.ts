import { isConfirmedChariowSaleStatus } from "./chariow/sales";

export type ProductSales = {
  product_id: string | null;
  product_name?: string | null;
  amount: number | string | null;
  net_amount: number | string | null;
  currency: string | null;
  status: string;
};
export type ProductCost = {
  product_id: string;
  currency: string;
  unit_cost: number;
  fee_per_sale: number;
  updated_at?: string;
};
const numeric = (value: unknown): number | null =>
  value == null || value === "" || !Number.isFinite(Number(value))
    ? null
    : Number(value);

/** Aggregates confirmed sales only, preserving currencies and unknown net revenue. */
export function aggregateProductProfit(
  sales: ProductSales[],
  costs: ProductCost[],
) {
  const map = new Map<
    string,
    {
      productId: string;
      productName: string | null;
      currency: string;
      units: number;
      grossRevenue: number;
      netRevenue: number | null;
    }
  >();
  for (const sale of sales) {
    if (!isConfirmedChariowSaleStatus(sale.status)) continue;
    const currency = String(sale.currency ?? "")
      .trim()
      .toUpperCase();
    if (!currency || sale.product_id == null) continue;
    const key = `${sale.product_id}\u0000${currency}`;
    const item = map.get(key) ?? {
      productId: sale.product_id,
      productName: sale.product_name?.trim() || null,
      currency,
      units: 0,
      grossRevenue: 0,
      netRevenue: 0,
    };
    item.units += 1;
    item.grossRevenue += numeric(sale.amount) ?? 0;
    const net = numeric(sale.net_amount);
    if (net == null) item.netRevenue = null;
    else {
      const currentNet = item.netRevenue;
      if (currentNet != null) item.netRevenue = currentNet + net;
    }
    if (!item.productName && sale.product_name?.trim())
      item.productName = sale.product_name.trim();
    map.set(key, item);
  }
  return [...map.values()].map((item) => {
    const cost = costs.find(
      (c) =>
        c.product_id === item.productId &&
        c.currency.toUpperCase() === item.currency,
    );
    const totalCosts =
      cost != null
        ? item.units * (Number(cost.unit_cost) + Number(cost.fee_per_sale))
        : null;
    const netRevenue = item.netRevenue;
    const profit =
      totalCosts == null || netRevenue == null ? null : netRevenue - totalCosts;
    return {
      ...item,
      totalCosts,
      profit,
      marginPercent:
        profit == null || netRevenue == null || netRevenue === 0
          ? null
          : (profit / netRevenue) * 100,
      costStatus:
        cost != null ? ("complete" as const) : ("incomplete" as const),
    };
  });
}
