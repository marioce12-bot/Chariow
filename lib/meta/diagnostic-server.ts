import { computeCampaignDiagnostics, type DiagnosticAttributedSale, type DiagnosticInsightRow } from "./diagnostic";

// Collecte serveur partagée par les routes /api/meta/diagnostic et
// /api/meta/diagnostic/analyze — garantit que la couche IA reçoit exactement
// le JSON produit par la couche diagnostic (jamais un recalcul parallèle).
export async function buildDiagnosticReports(
  supabase: any,
  user: { id: string },
  options: { accountId?: string | null; from?: string | null; to?: string | null },
): Promise<{ error: { message: string; status: number } } | { currency: string; reports: ReturnType<typeof computeCampaignDiagnostics> }> {
  const isoDay = (offsetDays: number) => new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);
  const to = options.to || isoDay(0);
  const from = options.from || isoDay(29);

  const accountsQuery = supabase.from("meta_ad_accounts").select("id,meta_account_id,currency").eq("user_id", user.id).eq("is_active", true);
  const { data: account, error: accountError } = await (options.accountId ? accountsQuery.eq("id", options.accountId).maybeSingle() : accountsQuery.limit(1).maybeSingle());
  if (accountError) return { error: { message: accountError.message, status: 500 } };
  if (!account) return { error: { message: "Aucun compte Meta Ads connecté", status: 404 } };

  // Insights quotidiens au niveau campagne — la baseline CTR est calculée par campagne.
  const { data: insightRows, error: insightError } = await supabase
    .from("meta_insights_daily")
    .select("level,entity_id,entity_name,date_start,impressions,reach,clicks,spend,conversion_value")
    .eq("ad_account_id", account.id)
    .eq("level", "campaign")
    .gte("date_start", from)
    .lte("date_start", to)
    .order("date_start", { ascending: true });
  if (insightError) return { error: { message: insightError.message, status: 500 } };

  // Ventes Chariow réelles reliées aux campagnes Meta via meta_attributions
  // (toutes les boutiques Chariow actives de l'utilisateur).
  const { data: stores } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .eq("platform", "chariow");
  const storeIds = (stores ?? []).map((store: { id: string }) => store.id);

  let attributedSales: DiagnosticAttributedSale[] = [];
  if (storeIds.length) {
    const { data: attributionRows, error: attributionError } = await supabase
      .from("meta_attributions")
      .select("chariow_sale_id,meta_campaign_id")
      .eq("user_id", user.id)
      .in("store_id", storeIds)
      .not("meta_campaign_id", "is", null)
      .gte("attributed_at", new Date(`${from}T00:00:00Z`).toISOString())
      .lte("attributed_at", new Date(`${to}T23:59:59Z`).toISOString());
    if (attributionError) return { error: { message: attributionError.message, status: 500 } };

    // meta_attributions.chariow_sale_id référence chariow_sales.chariow_sale_id (texte).
    const saleIds = [...new Set((attributionRows ?? []).map((row: { chariow_sale_id: string }) => row.chariow_sale_id).filter(Boolean))];
    if (saleIds.length) {
      const { data: saleRows, error: saleError } = await supabase
        .from("chariow_sales")
        .select("chariow_sale_id,amount,status")
        .in("chariow_sale_id", saleIds);
      if (saleError) return { error: { message: saleError.message, status: 500 } };
      const saleById = new Map<string, { amount: number; status: string }>();
      for (const sale of (saleRows ?? []) as Array<{ chariow_sale_id: string; amount: number; status: string }>) {
        saleById.set(sale.chariow_sale_id, { amount: sale.amount, status: sale.status });
      }
      attributedSales = (attributionRows ?? [])
        .map((row: { chariow_sale_id: string; meta_campaign_id: string }): DiagnosticAttributedSale | null => {
          const sale = saleById.get(row.chariow_sale_id ?? "");
          return sale ? { meta_campaign_id: row.meta_campaign_id, amount: sale.amount, status: sale.status } : null;
        })
        .filter((sale: DiagnosticAttributedSale | null): sale is DiagnosticAttributedSale => sale !== null);
    }
  }

  const reports = computeCampaignDiagnostics((insightRows ?? []) as DiagnosticInsightRow[], attributedSales, { from, to });
  return { currency: account.currency ?? "XOF", reports };
}
