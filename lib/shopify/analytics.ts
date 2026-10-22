import type { ChariowNormalizedSnapshot } from "@/lib/chariow/types";
import { isConfirmedShopifySaleStatus } from "@/lib/shopify/sales";
type Rec = Record<string, unknown>;
const rec = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {};
const txt = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const gid = (v: unknown, type: string) =>
  txt(v)?.replace(new RegExp(`^gid://shopify/${type}/`), "") ?? null;
function confirmed(status: unknown, cancelled: unknown, test: unknown) {
  return !cancelled && test !== true && isConfirmedShopifySaleStatus(status);
}
export function normalizeShopifySnapshot(
  snapshot: Rec,
  period?: { from: string; to: string },
): ChariowNormalizedSnapshot {
  const store = rec(snapshot.store),
    products = Array.isArray(rec(snapshot.products).data)
      ? rec(snapshot.products).data
      : [],
    raw = Array.isArray(rec(snapshot.sales).data)
      ? rec(snapshot.sales).data
      : [];
  const rows = raw.map((o: Record<string, any>) => {
    const original = rec(rec(o.totalPriceSet).shopMoney),
      refund = num(rec(rec(o.totalRefundedSet).shopMoney).amount),
      originalAmount = num(original.amount),
      currency = txt(original.currencyCode) ?? txt(o.currencyCode),
      financial = String(o.displayFinancialStatus ?? "unknown").toLowerCase(),
      cancelled = !!o.cancelledAt,
      test = o.test === true,
      refunded = refund ?? 0,
      amount =
        financial === "refunded"
          ? 0
          : originalAmount === null
            ? null
            : Math.max(0, originalAmount - refunded);
    const summary = rec(o.customerJourneySummary),
      visit = rec(summary.lastVisit ?? summary.firstVisit),
      utm = rec(visit.utmParameters),
      rawItems = rec(o.lineItems).edges ?? [],
      hasMore = rec(o.lineItems).pageInfo?.hasNextPage === true;
    const items = rawItems.map((e: Record<string, any>) => {
      const l = rec(e.node),
        p = rec(l.product ?? rec(l.variant).product),
        price = rec(rec(l.discountedTotalSet).shopMoney),
        quantity = num(l.quantity) ?? 0,
        ids = gid(p.id, "Product");
      return {
        product_id: ids,
        title: txt(p.title) ?? txt(l.title),
        product_name: txt(p.title) ?? txt(l.title),
        quantity,
        amount:
          (refund ?? 0) > 0 || financial === "refunded" || hasMore
            ? null
            : num(price.amount),
        currency: txt(price.currencyCode) ?? currency,
        unit_price:
          (refund ?? 0) > 0 || financial === "refunded" || hasMore
            ? null
            : num(price.amount) === null || quantity === 0
              ? null
              : num(price.amount)! / quantity,
      };
    });
    return {
      id: `shopify:${String(store.id ?? "store")}:${gid(o.id, "Order") ?? ""}`,
      status: cancelled
        ? "cancelled"
        : financial === "refunded"
          ? "refunded"
          : financial === "partially_refunded"
            ? "paid"
            : financial,
      amount: cancelled || test ? null : amount,
      currency,
      created_at: txt(o.createdAt),
      product_id: items.length === 1 ? items[0].product_id : null,
      product_name: items.length === 1 ? items[0].product_name : null,
      line_items: hasMore ? [] : items,
      line_items_complete:
        !hasMore && refund === null && financial !== "refunded",
      cancelled_at: o.cancelledAt ?? null,
      test,
      original_financial_status: financial,
      refund_amount: refund,
      net_amount: null,
      customer_id: null,
      campaign_id: txt(utm.campaign),
      campaign_name: txt(utm.campaign),
      utm_source: txt(utm.source),
      utm_medium: txt(utm.medium),
      utm_campaign: txt(utm.campaign),
      utm_content: txt(utm.content),
      utm_term: txt(utm.term),
      landing_page_url: txt(visit.landingPage),
      referring_site: txt(visit.referrerUrl),
      onlineStoreUrl: null,
      raw_payload: {
        provider: "shopify",
        order_id: gid(o.id, "Order"),
        status: financial,
        original_financial_status: financial,
        refund_amount: refund,
        source: "shopify_admin",
        campaign_id: txt(utm.campaign),
        campaign_name: txt(utm.campaign),
        utm_campaign: txt(utm.campaign),
        utm_source: txt(utm.source),
        utm_medium: txt(utm.medium),
        utm_content: txt(utm.content),
        utm_term: txt(utm.term),
      },
    };
  });
  const normalizedProducts = products.map((p: Record<string, any>) => {
    const price = rec(rec(p.priceRangeV2).minVariantPrice),
      id = gid(p.id, "Product") ?? String(p.id);
    const count = rows.filter(
      (s: Record<string, any>) =>
        confirmed(s.status, s.cancelled_at, s.test) &&
        s.line_items.some((l: Record<string, any>) => l.product_id === id),
    ).length;
    const url =
      txt(p.onlineStoreUrl) ??
      (txt(p.handle) && txt(rec(store.primaryDomain).url)
        ? `${String(rec(store.primaryDomain).url).replace(/\/$/, "")}/products/${p.handle}`
        : null);
    return {
      id,
      name: txt(p.title) ?? "Produit sans nom",
      description: txt(p.descriptionHtml),
      price: num(price.amount),
      currency: txt(price.currencyCode) ?? txt(store.currencyCode),
      status: txt(p.status),
      image: txt(rec(p.featuredImage).url),
      url,
      urlIsFallback: false,
      createdAt: txt(p.createdAt),
      sales: count,
    };
  });
  const byCurrency = new Map<string, number>();
  for (const sale of rows)
    if (
      confirmed(sale.status, sale.cancelled_at, sale.test) &&
      sale.amount !== null &&
      sale.currency
    )
      byCurrency.set(
        sale.currency,
        (byCurrency.get(sale.currency) ?? 0) + sale.amount,
      );
  const currencies = [...byCurrency].map(([currency, value]) => ({
      currency,
      value,
    })),
    one = currencies.length === 1 ? currencies[0] : null;
  return {
    storeName: txt(store.name) ?? txt(store.shop) ?? "Boutique Shopify",
    storeStatus: "connected",
    products: normalizedProducts,
    sales: rows,
    kpis: {
      period: period ??
        (rec(snapshot.period) as any) ?? { from: null, to: null },
      revenue: {
        value: one?.value ?? null,
        formatted: one ? `${one.value} ${one.currency}` : null,
      },
      revenueByCurrency: currencies,
      sales: rows.filter((s: Record<string, any>) =>
        confirmed(s.status, s.cancelled_at, s.test),
      ).length,
      visits: null,
      conversionRate: "indisponible",
      customers: null,
      productsSold: rows
        .filter((s: Record<string, any>) =>
          confirmed(s.status, s.cancelled_at, s.test),
        )
        .reduce(
          (n: number, s: Record<string, any>) =>
            n +
            s.line_items.reduce(
              (x: number, l: Record<string, any>) => x + (l.quantity || 0),
              0,
            ),
          0,
        ),
    },
  } as unknown as ChariowNormalizedSnapshot;
}
export function shopifySaleRows(storeId: string, sales: unknown) {
  const input = Array.isArray(sales)
    ? sales
    : Array.isArray(rec(sales).data)
      ? rec(sales).data
      : [];
  return input
    .filter((x: unknown) => rec(x).test !== true)
    .map((x: unknown) => {
      const s = rec(x),
        raw = rec(s.raw_payload),
        id = String(s.id ?? "").replace(/^shopify:[^:]+:/, "");
      return {
        chariow_sale_id: `shopify:${storeId}:${id}`,
        store_id: storeId,
        product_id: txt(s.product_id),
        chariow_campaign_id: txt(s.campaign_id),
        chariow_campaign_name: txt(s.campaign_name),
        status: String(s.status ?? "unknown"),
        amount: num(s.amount),
        net_amount: null,
        currency: txt(s.currency),
        settlement_done: false,
        event_type: "shopify.orders.sync",
        occurred_at: txt(s.created_at),
        updated_at: new Date().toISOString(),
        raw_payload: {
          provider: "shopify",
          order_id: raw.order_id ?? id,
          original_financial_status: s.original_financial_status,
          refund_amount: s.refund_amount,
          line_items: s.line_items ?? [],
        },
      };
    })
    .filter((r: Record<string, any>) => !r.chariow_sale_id.endsWith(":"));
}
