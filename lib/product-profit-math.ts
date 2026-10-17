import { isConfirmedChariowSaleStatus } from "./chariow/sales";

export const CHARIOW_FEE_RATE = 0.15;
export type ProductSales = {
  product_id: string | null;
  product_name?: string | null;
  amount: number | string | null;
  net_amount: number | string | null;
  currency: string | null;
  status: string;
  raw_payload?: unknown;
};
export type ProductCost = {
  product_id: string;
  currency: string;
  unit_cost: number;
  fee_per_sale: number;
  updated_at?: string;
};
const numeric = (value: unknown): number | null =>
  value == null || value === "" ||
  (typeof value !== "number" && typeof value !== "string") ||
  !Number.isFinite(Number(value))
    ? null
    : Number(value);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
const amountValue = (value: unknown) => numeric(record(value).value ?? value);
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Imported rows historically store missing settlement amounts as zero.
 * Check their source payload to distinguish an absent net from an explicit zero.
 * A real Chariow net is authoritative: platform fees are never deducted again.
 */
function receivedNet(sale: ProductSales): number | null {
  const raw = record(sale.raw_payload);
  const payload = record(raw.data ?? raw.payload ?? raw.sale ?? raw);
  const explicit = amountValue(record(payload.settlement).amount) ?? amountValue(payload.net_amount);
  if (explicit != null) return explicit;
  const stored = numeric(sale.net_amount);
  if (stored === 0 && Object.keys(raw).length > 0) return null;
  return stored;
}

/** Confirmed ebook sales: zero manufacturing cost by default; currencies stay separate. */
export function aggregateProductProfit(sales: ProductSales[], costs: ProductCost[]) {
  const map = new Map<string, {
    productId: string;
    productName: string | null;
    currency: string;
    units: number;
    grossRevenue: number;
    netRevenue: number | null;
    chariowFees: number | null;
    estimatedNetRevenue: boolean;
    grossComplete: boolean;
  }>();
  for (const sale of sales) {
    if (!isConfirmedChariowSaleStatus(sale.status)) continue;
    const currency = String(sale.currency ?? "").trim().toUpperCase();
    if (!currency || sale.product_id == null) continue;
    const key = `${sale.product_id}\u0000${currency}`;
    const item = map.get(key) ?? {
      productId: sale.product_id,
      productName: sale.product_name?.trim() || null,
      currency,
      units: 0,
      grossRevenue: 0,
      netRevenue: 0,
      chariowFees: 0,
      estimatedNetRevenue: false,
      grossComplete: true,
    };
    item.units += 1;
    const gross = numeric(sale.amount);
    item.grossRevenue += gross ?? 0;
    if (gross == null) item.grossComplete = false;
    const received = receivedNet(sale);
    const net = received ?? (gross == null ? null : roundMoney(gross * (1 - CHARIOW_FEE_RATE)));
    if (received == null && net != null) item.estimatedNetRevenue = true;
    if (net == null) item.netRevenue = null;
    else if (item.netRevenue != null) item.netRevenue += net;
    if (gross == null || net == null) item.chariowFees = null;
    else if (item.chariowFees != null) item.chariowFees += gross - net;
    if (!item.productName && sale.product_name?.trim()) item.productName = sale.product_name.trim();
    map.set(key, item);
  }
  return [...map.values()].map(({ grossComplete, ...item }) => {
    const cost = costs.find((c) => c.product_id === item.productId && c.currency.toUpperCase() === item.currency);
    // These are manufacturing and OPTIONAL other fees, not Chariow's 15%.
    const totalCosts = roundMoney(item.units * (Number(cost?.unit_cost ?? 0) + Number(cost?.fee_per_sale ?? 0)));
    const netRevenue = item.netRevenue == null ? null : roundMoney(item.netRevenue);
    const profit = netRevenue == null ? null : roundMoney(netRevenue - totalCosts);
    return {
      ...item,
      grossRevenue: roundMoney(item.grossRevenue),
      netRevenue,
      chariowFees: item.chariowFees == null ? null : roundMoney(item.chariowFees),
      chariowFeeRate: CHARIOW_FEE_RATE,
      totalCosts,
      profit,
      marginPercent: profit == null || !grossComplete || item.grossRevenue === 0
        ? null : (profit / item.grossRevenue) * 100,
      costStatus: "complete" as const,
    };
  });
}
