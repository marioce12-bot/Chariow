// Transforme les ventes Chariow en lignes normalisées, sans conserver le payload
// fournisseur : il peut contenir noms, coordonnées, adresses ou secrets.

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const row = record(value);
  for (const key of ["data", "items", "sales", "results"]) if (Array.isArray(row[key])) return row[key] as unknown[];
  return [];
}
function amount(value: unknown) {
  const row = record(value);
  const raw = row.value ?? value;
  if (raw == null || typeof raw === "boolean" || (typeof raw === "string" && !raw.trim())) return null;
  const parsed = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
function text(...values: unknown[]) {
  for (const value of values) if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}
function timestamp(...values: unknown[]) {
  const value = values.find((item) => typeof item === "string" && item.trim());
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function chariowSaleRows(storeId: string, sales: unknown, userId?: string | null, options: { includeCustomerId?: boolean } = {}) {
  return arrayValue(sales).map((item) => {
    const sale = record(item);
    const product = record(sale.product);
    const settlement = record(sale.settlement);
    const metadata = record(sale.custom_metadata ?? sale.metadata);
    const campaign = record(sale.campaign ?? metadata.campaign ?? metadata.marketing_campaign);
    const saleId = String(sale.id ?? sale.sale_id ?? sale.order_id ?? "");
    const productId = String(sale.product_id ?? product.id ?? product.uuid ?? metadata.product_id ?? "") || null;
    const productName = text(sale.product_name, product.name, product.title, metadata.product_name);
    const status = String(sale.status ?? "unknown");
    const amountValue = amount(sale.amount);
    const currency = String(record(sale.amount).currency ?? sale.currency ?? "") || null;
    const occurredAt = timestamp(sale.created_at, sale.createdAt, sale.occurred_at);
    const safePayload = {
      event_id: String(sale.event_id ?? sale.id ?? sale.sale_id ?? sale.order_id ?? "") || null,
      store_id: storeId,
      user_id: userId ?? null,
      status,
      amount: amountValue,
      currency,
      product_id: productId,
      product_name: productName,
      created_at: occurredAt,
    };
    return {
      chariow_sale_id: saleId,
      store_id: storeId,
      product_id: productId,
      product_name: productName,
      chariow_campaign_id: String(campaign.id ?? campaign.campaign_id ?? sale.campaign_id ?? metadata.campaign_id ?? "") || null,
      chariow_campaign_name: String(campaign.name ?? campaign.title ?? sale.campaign_name ?? metadata.campaign_name ?? "") || null,
      status,
      amount: amountValue,
      net_amount: amount(settlement.amount ?? sale.net_amount),
      currency,
      settlement_done: Boolean(settlement.done_at),
      event_type: "list_sales.sync",
      occurred_at: occurredAt,
      updated_at: new Date().toISOString(),
      raw_payload: safePayload,
      ...(options.includeCustomerId ? {
        customer_id: String(sale.customer_id ?? record(sale.customer).id ?? record(sale.customer).uuid ?? "") || null,
      } : {}),
    };
  }).filter((row) => row.chariow_sale_id);
}
