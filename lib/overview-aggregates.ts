import { convertCurrency } from "@/lib/currency";
import { isConfirmedChariowSaleStatus } from "@/lib/chariow/sales";
import { aggregateCustomers, abandonmentRate, customerValue, isLowData, maxCostPerCustomer, repeatRate } from "@/lib/unit-economics";
import type { PaginatedResult } from "@/lib/paginated-query";

export type SaleRow = { status: string | null; net_amount: number | string | null; currency: string | null; occurred_at: string | null; customer_id: string | null };

function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
export function addDays(value: string, days: number) { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return isoDate(date); }
export function daysBetween(from: string, to: string) { return Math.max(1, Math.round((new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) / 86400000) + 1); }
function amountInCurrency(sale: Pick<SaleRow, "net_amount" | "currency">, targetCurrency: string) {
  const amount = sale.net_amount == null || sale.net_amount === "" ? NaN : Number(sale.net_amount); const currency = sale.currency?.trim().toUpperCase();
  if (!Number.isFinite(amount) || !currency) return null;
  return currency === targetCurrency ? amount : convertCurrency(amount, currency, targetCurrency);
}

export type ProductCatalogEntry = { id: string; name: string; image: string | null };
export type ProductPerformance = ProductCatalogEntry & { sales: number; revenueNet: number | null };

export function buildProductPerformance(
  rows: Array<Pick<SaleRow, "status" | "net_amount" | "currency"> & { product_id: string | null }>,
  products: ProductCatalogEntry[],
  targetCurrency: string,
): ProductPerformance[] {
  const catalog = new Map(products.map((product) => [product.id, product]));
  const totals = new Map<string, { sales: number; revenueNet: number; convertible: boolean }>();
  for (const sale of rows) {
    if (!isConfirmedChariowSaleStatus(sale.status) || !sale.product_id || !catalog.has(sale.product_id)) continue;
    const total = totals.get(sale.product_id) ?? { sales: 0, revenueNet: 0, convertible: true };
    total.sales += 1;
    const converted = amountInCurrency(sale, targetCurrency);
    if (converted === null) total.convertible = false;
    else total.revenueNet += converted;
    totals.set(sale.product_id, total);
  }
  return [...totals.entries()].map(([id, total]) => ({
    ...catalog.get(id)!,
    sales: total.sales,
    revenueNet: total.convertible ? Math.round(total.revenueNet * 100) / 100 : null,
  })).sort((a, b) => b.sales - a.sales || (b.revenueNet ?? -1) - (a.revenueNet ?? -1));
}

export function buildOverviewAggregates(rows: SaleRow[], targetCurrency: string, periodFrom: string, periodTo: string) {
  const confirmed = rows.filter((sale) => isConfirmedChariowSaleStatus(sale.status));
  const refunds = rows.filter((sale) => /refund|chargeback/i.test(sale.status ?? ""));
  const customers = aggregateCustomers(rows, targetCurrency);
  let complete = true;
  let revenueTotal = 0;
  for (const sale of confirmed) { const amount = amountInCurrency(sale, targetCurrency); if (amount === null) complete = false; else revenueTotal += amount; }
  for (const sale of refunds) { const amount = amountInCurrency(sale, targetCurrency); if (amount === null) complete = false; else revenueTotal -= Math.abs(amount); }
  const revenueNet = complete ? Math.round(revenueTotal * 100) / 100 : null;
  const convertedSales = confirmed.filter((sale) => amountInCurrency(sale, targetCurrency) !== null).length;
  const daily = new Map<string, number>();
  const unknownDays = new Set<string>();
  for (const sale of [...confirmed, ...refunds]) { const amount = amountInCurrency(sale, targetCurrency); const day = sale.occurred_at?.slice(0, 10) ?? ""; if (!day) continue; if (amount === null) unknownDays.add(day); else daily.set(day, (daily.get(day) ?? 0) + (refunds.includes(sale) ? -Math.abs(amount) : amount)); }
  const revenueSeries = Array.from({ length: daysBetween(periodFrom, periodTo) }, (_, index) => { const date = addDays(periodFrom, index); return { date, revenueNet: unknownDays.has(date) ? null : Math.round((daily.get(date) ?? 0) * 100) / 100 }; });
  const abandoned = rows.filter((sale) => sale.status?.trim().toLowerCase() === "abandoned").length;
  const failed = rows.filter((sale) => sale.status?.trim().toLowerCase() === "failed").length;
  const value = customers.skippedSales || customers.withoutCustomer ? null : customerValue(customers.netByCustomer);
  return { currency: targetCurrency, revenueNet, revenueSeries, sales: confirmed.length, averageBasket: revenueNet !== null && convertedSales ? Math.round((revenueNet / convertedSales) * 100) / 100 : null, customers: customers.customers, repeatRate: repeatRate(customers.ordersByCustomer), abandoned, abandonmentRate: abandonmentRate({ completed: confirmed.length, abandoned, failed }), customerValue: value, maxCostPerCustomer: maxCostPerCustomer(value), lowData: isLowData(customers.customers), withoutCustomer: customers.withoutCustomer, skippedSales: customers.skippedSales };
}

export function buildOverviewFromPages(
  current: PaginatedResult<SaleRow>,
  previous: PaginatedResult<SaleRow>,
  targetCurrency: string,
  periodFrom: string,
  periodTo: string,
  connectedAt: string | null,
  targetMargin: number,
) {
  if (current.error || previous.error) return null;
  const currentOverview = buildOverviewAggregates(current.rows, targetCurrency, periodFrom, periodTo);
  const previousFrom = addDays(periodFrom, -daysBetween(periodFrom, periodTo));
  const previousTo = addDays(periodFrom, -1);
  const previousOverview = buildOverviewAggregates(previous.rows, targetCurrency, previousFrom, previousTo);
  const revenueChangePct = previousOverview.revenueNet !== null && previousOverview.revenueNet > 0
    ? Math.round((((currentOverview.revenueNet ?? 0) - previousOverview.revenueNet) / previousOverview.revenueNet) * 1000) / 10
    : null;
  return {
    ...currentOverview,
    previousRevenueNet: previousOverview.revenueNet,
    revenueChangePct,
    targetMargin,
    connectedAt,
    period: { from: periodFrom, to: periodTo },
  };
}
