// Transforme les ventes renvoyées par Chariow (list_sales) en lignes `chariow_sales`.
// Utilisé pour enregistrer les ventes au moment où le tableau de bord est ouvert : la synchro
// automatique ne passe qu'une fois par nuit, donc une vente faite dans la journée n'apparaissait
// pas (le tableau de bord affichait 0) jusqu'au lendemain.

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

export function chariowSaleRows(storeId: string, sales: unknown) {
  return arrayValue(sales).map((item) => {
    const sale = record(item);
    const settlement = record(sale.settlement);
    const metadata = record(sale.custom_metadata ?? sale.metadata);
    const campaign = record(sale.campaign ?? metadata.campaign ?? metadata.marketing_campaign);
    return {
      chariow_sale_id: String(sale.id ?? sale.sale_id ?? sale.order_id ?? ""),
      store_id: storeId,
      product_id: String(sale.product_id ?? record(sale.product).id ?? "") || null,
      chariow_campaign_id: String(campaign.id ?? campaign.campaign_id ?? sale.campaign_id ?? metadata.campaign_id ?? "") || null,
      chariow_campaign_name: String(campaign.name ?? campaign.title ?? sale.campaign_name ?? metadata.campaign_name ?? "") || null,
      status: String(sale.status ?? "unknown"),
      amount: amount(sale.amount),
      net_amount: amount(settlement.amount ?? sale.net_amount),
      currency: String(record(sale.amount).currency ?? sale.currency ?? "") || null,
      settlement_done: Boolean(settlement.done_at),
      event_type: "list_sales.sync",
      occurred_at: sale.created_at || sale.createdAt ? String(sale.created_at ?? sale.createdAt) : null,
      updated_at: new Date().toISOString(),
      raw_payload: sale,
    };
  }).filter((row) => row.chariow_sale_id);
}
