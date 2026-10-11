import { convertCurrency } from "@/lib/currency";
import { isConfirmedChariowSaleStatus } from "@/lib/chariow/sales";
import { aggregateCustomers, abandonmentRate, customerValue, isLowData, maxCostPerCustomer, repeatRate } from "@/lib/unit-economics";
import type { PaginatedResult } from "@/lib/paginated-query";

export type SaleRow = { status: string | null; net_amount: number | string | null; currency: string | null; occurred_at: string | null; customer_id: string | null };

function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
export function addDays(value: string, days: number) { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return isoDate(date); }
export function daysBetween(from: string, to: string) { return Math.max(1, Math.round((new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) / 86400000) + 1); }
function amountInCurrency(sale: SaleRow, targetCurrency: string) {
  const amount = Number(sale.net_amount); const currency = sale.currency?.trim().toUpperCase();
  if (!Number.isFinite(amount) || !currency) return null;
  return currency === targetCurrency ? amount : convertCurrency(amount, currency, targetCurrency);
}

export function buildOverviewAggregates(rows: SaleRow[], targetCurrency: string, periodFrom: string, periodTo: string) {
  const confirmed = rows.filter((sale) => isConfirmedChariowSaleStatus(sale.status));
  const customers = aggregateCustomers(rows, targetCurrency);
  const revenueNet = confirmed.reduce((sum, sale) => sum + (amountInCurrency(sale, targetCurrency) ?? 0), 0);
  const convertedSales = confirmed.filter((sale) => amountInCurrency(sale, targetCurrency) !== null).length;
  const daily = new Map<string, number>();
  for (const sale of confirmed) { const amount = amountInCurrency(sale, targetCurrency); const day = sale.occurred_at?.slice(0, 10) ?? ""; if (amount !== null && day) daily.set(day, (daily.get(day) ?? 0) + amount); }
  const revenueSeries = Array.from({ length: daysBetween(periodFrom, periodTo) }, (_, index) => { const date = addDays(periodFrom, index); return { date, revenueNet: Math.round((daily.get(date) ?? 0) * 100) / 100 }; });
  const abandoned = rows.filter((sale) => sale.status?.trim().toLowerCase() === "abandoned").length;
  const failed = rows.filter((sale) => sale.status?.trim().toLowerCase() === "failed").length;
  const value = customerValue(customers.netByCustomer);
  return { currency: targetCurrency, revenueNet: Math.round(revenueNet * 100) / 100, revenueSeries, sales: confirmed.length, averageBasket: convertedSales ? Math.round((revenueNet / convertedSales) * 100) / 100 : null, customers: customers.customers, repeatRate: repeatRate(customers.ordersByCustomer), abandoned, abandonmentRate: abandonmentRate({ completed: confirmed.length, abandoned, failed }), customerValue: value, maxCostPerCustomer: maxCostPerCustomer(value), lowData: isLowData(customers.customers), withoutCustomer: customers.withoutCustomer, skippedSales: customers.skippedSales };
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
  const revenueChangePct = previousOverview.revenueNet > 0
    ? Math.round(((currentOverview.revenueNet - previousOverview.revenueNet) / previousOverview.revenueNet) * 1000) / 10
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
