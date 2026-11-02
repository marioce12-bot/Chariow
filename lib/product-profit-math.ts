import { isConfirmedChariowSaleStatus } from "./chariow/sales";

export const CHARIOW_FEE_RATE = 0.15;
export type ProductSales = {
  product_id: string | null;
  chariow_campaign_id?: string | null;
  chariow_campaign_name?: string | null;
  product_name?: string | null;
  amount: number | string | null;
  net_amount: number | string | null;
  currency: string | null;
  status: string;
  raw_payload?: unknown;
  quantity?: number;
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

/** Preserve an explicit source net. Legacy imported zeroes with payload but no source net are placeholders. */
function receivedNet(sale: ProductSales): number | null {
  const raw = record(sale.raw_payload);
  const payload = record(raw.data ?? raw.payload ?? raw.sale ?? raw);
  const settlement = record(payload.settlement);
  const explicit = amountValue(settlement.amount) ?? amountValue(payload.net_amount);
  if (explicit != null) return explicit;
  const stored = numeric(sale.net_amount);
  if (stored === 0 && Object.keys(raw).length > 0) return null;
  return stored;
}

/** Ebook production costs default to zero; advertising attribution is not available here. */
export function aggregateProductProfit(sales: ProductSales[], costs: ProductCost[]) {
  const map = new Map<string, {
    productId: string; productName: string | null; currency: string; isShopify: boolean; units: number;
    grossRevenue: number; netRevenue: number | null; chariowFees: number | null;
    estimatedNetRevenue: boolean; grossComplete: boolean; refunds: number;
    campaigns: Map<string, { id: string; name: string | null; sales: number }>;
  }>();
  for (const originalSale of sales) {
    const isShopify = record(originalSale.raw_payload).provider === "shopify";
    const rawPayload = record(originalSale.raw_payload);
    const rawItems = rawPayload.line_items;
    const refundStatus = String(rawPayload.original_financial_status ?? rawPayload.status ?? originalSale.status).toLowerCase();
    const isShopifyRefund = isShopify && refundStatus.includes("refund");
    const isFullShopifyRefund = isShopify && refundStatus === "refunded";
    // Shopify payloads can represent one order with multiple product lines; each
    // line's amount is treated as its gross line total (not unit price).
    const lineItems = isShopify && Array.isArray(rawItems) ? rawItems : null;
    const expandedSales: ProductSales[] = lineItems?.length
      ? lineItems.map((line) => {
          const li = record(line);
          return {
            ...originalSale,
            product_id: String(li.product_id ?? originalSale.product_id ?? ""),
            product_name: typeof li.title === "string" ? li.title : originalSale.product_name,
            amount: isShopifyRefund ? null : amountValue(li.amount),
            quantity: isShopifyRefund ? 0 : Math.max(0, Number(li.quantity ?? 1) || 0),
            currency: typeof li.currency === "string" ? li.currency : originalSale.currency,
            net_amount: li.net_amount == null ? (lineItems.length === 1 ? originalSale.net_amount : null) : amountValue(li.net_amount),
            raw_payload: { provider: "shopify", net_amount: li.net_amount },
            status: originalSale.status,
          };
        })
      : [originalSale];
    for (const sale of expandedSales) {
    const status = String(sale.status ?? "").trim().toLowerCase();
    const refunded = isShopify ? isFullShopifyRefund : status.includes("refund") || status.includes("chargeback");
    if (!isShopify && !isConfirmedChariowSaleStatus(status) && !refunded && status !== "paid") continue;
    if (isShopify && !["paid", "partially_refunded", "refunded"].includes(status)) continue;
    const currency = String(sale.currency ?? "").trim().toUpperCase();
    if (!currency || sale.product_id == null) continue;
    const key = `${sale.product_id}\u0000${currency}`;
    const item = map.get(key) ?? {
      productId: sale.product_id, productName: sale.product_name?.trim() || null,
      currency, isShopify, units: 0, grossRevenue: 0, netRevenue: 0, chariowFees: 0,
      estimatedNetRevenue: false, grossComplete: true, refunds: 0, campaigns: new Map(),
    };
    if (refunded && !isShopify) {
      item.refunds += 1;
      const refundGross = numeric(sale.amount);
      if (refundGross == null) item.grossComplete = false;
      else item.grossRevenue -= Math.abs(refundGross);
      // A refund without an authoritative settlement net has unknown financial impact.
      const refundNet = receivedNet(sale);
      if (refundNet == null) item.netRevenue = null;
      else if (item.netRevenue != null) item.netRevenue -= Math.abs(refundNet);
      if (isShopify || refundGross == null || refundNet == null) item.chariowFees = null;
      else if (item.chariowFees != null) item.chariowFees -= Math.abs(refundGross) - Math.abs(refundNet);
      map.set(key, item);
      continue;
    }
    item.units += isShopify ? Math.max(0, Number(sale.quantity ?? 1) || 0) : 1;
    const campaignId = sale.chariow_campaign_id?.trim();
    if (campaignId) {
      const campaign = item.campaigns.get(campaignId) ?? { id: campaignId, name: sale.chariow_campaign_name?.trim() || null, sales: 0 };
      campaign.sales += 1;
      item.campaigns.set(campaignId, campaign);
    }
    const gross = isShopifyRefund ? null : numeric(sale.amount);
    item.grossRevenue += gross ?? 0;
    if (gross == null) item.grossComplete = false;
    const received = receivedNet(sale);
    const net = received ?? (isShopify || gross == null ? null : roundMoney(gross * (1 - CHARIOW_FEE_RATE)));
    if (!isShopify && received == null && net != null) item.estimatedNetRevenue = true;
    if (net == null) item.netRevenue = null;
    else if (item.netRevenue != null) item.netRevenue += net;
    if (isShopify || gross == null || net == null) item.chariowFees = null;
    else if (item.chariowFees != null) item.chariowFees += gross - net;
    if (!item.productName && sale.product_name?.trim()) item.productName = sale.product_name.trim();
    map.set(key, item);
    }
  }
  return [...map.values()].map(({ grossComplete, campaigns, ...item }) => {
    const cost = costs.find((c) => c.product_id === item.productId && c.currency.toUpperCase() === item.currency);
    // Manufacturing and optional fees are not Chariow's 15% fee.
    const totalCosts = roundMoney(item.units * (Number(cost?.unit_cost ?? 0) + Number(cost?.fee_per_sale ?? 0)));
    const netRevenue = item.netRevenue == null ? null : roundMoney(item.netRevenue);
    // Ad spend is not attributable to products, so a realized profit cannot be claimed.
    const profit = null;
    return {
      ...item, grossRevenue: grossComplete ? roundMoney(item.grossRevenue) : null,
      netRevenue, chariowFees: item.chariowFees == null ? null : roundMoney(item.chariowFees),
      chariowFeeRate: item.isShopify ? null : CHARIOW_FEE_RATE, totalCosts, profit, marginPercent: null,
      costStatus: "complete" as const, campaigns: [...campaigns.values()],
      provenance: { paidSales: item.units, refundCount: item.refunds,
        campaignLinkedSales: [...campaigns.values()].reduce((n, c) => n + c.sales, 0),
        reliability: grossComplete && item.netRevenue != null ? "complete" as const : "partial" as const },
    };
  });
}
