import { computeCampaignDiagnostics, type DiagnosticAttributedSale, type DiagnosticInsightRow } from "./diagnostic";

// Collecte serveur partagée par les routes /api/meta/diagnostic et
// /api/meta/diagnostic/analyze — garantit que la couche IA reçoit exactement
// le JSON produit par la couche diagnostic (jamais un recalcul parallèle).
//
// Robustesse : chaque bloc de collecte est isolé. Si la partie attribution
// échoue, on continue quand même avec les étages 1-2 (CTR / créative) qui n'en
// dépendent pas — et l'erreur exacte est renvoyée au client + loggée côté
// serveur pour être visible dans les logs Vercel.

export type DiagnosticBuildResult =
  | { error: { message: string; status: number } }
  | { currency: string; reports: ReturnType<typeof computeCampaignDiagnostics>; warnings: string[] };

export async function buildDiagnosticReports(
  supabase: any,
  user: { id: string },
  options: { accountId?: string | null; from?: string | null; to?: string | null },
): Promise<DiagnosticBuildResult> {
  const warnings: string[] = [];
  try {
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
    if (insightError) {
      console.error("diagnostic: insights query failed", insightError.message);
      return { error: { message: insightError.message, status: 500 } };
    }

    // Ventes Chariow réelles reliées aux campagnes Meta via meta_attributions
    // (toutes les boutiques Chariow actives de l'utilisateur). Bloc isolé :
    // un échec ici dégrade l'étage 3 mais ne casse pas le diagnostic entier.
    let attributedSales: DiagnosticAttributedSale[] = [];
    try {
      const { data: stores, error: storesError } = await supabase
        .from("stores")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .eq("platform", "chariow");
      if (storesError) throw new Error(storesError.message);
      const storeIds = (stores ?? []).map((store: { id: string }) => store.id);

      if (storeIds.length) {
        const { data: attributionRows, error: attributionError } = await supabase
          .from("meta_attributions")
          .select("chariow_sale_id,meta_campaign_id")
          .eq("user_id", user.id)
          .in("store_id", storeIds)
          .gte("attributed_at", new Date(`${from}T00:00:00Z`).toISOString())
          .lte("attributed_at", new Date(`${to}T23:59:59Z`).toISOString());
        if (attributionError) throw new Error(attributionError.message);

        // meta_attributions.chariow_sale_id référence chariow_sales.chariow_sale_id (texte).
        const linkedRows = (attributionRows ?? []).filter((row: { chariow_sale_id: string | null; meta_campaign_id: string | null }) => Boolean(row.chariow_sale_id && row.meta_campaign_id));
        const saleIds = [...new Set(linkedRows.map((row: { chariow_sale_id: string }) => row.chariow_sale_id))];
        if (saleIds.length) {
          const { data: saleRows, error: saleError } = await supabase
            .from("chariow_sales")
            .select("chariow_sale_id,amount,status")
            .in("chariow_sale_id", saleIds);
          if (saleError) throw new Error(saleError.message);
          const saleById = new Map<string, { amount: number; status: string }>();
          for (const sale of (saleRows ?? []) as Array<{ chariow_sale_id: string; amount: number; status: string }>) {
            saleById.set(sale.chariow_sale_id, { amount: sale.amount, status: sale.status });
          }
          attributedSales = linkedRows
            .map((row: { chariow_sale_id: string; meta_campaign_id: string }): DiagnosticAttributedSale | null => {
              const sale = saleById.get(row.chariow_sale_id);
              return sale ? { meta_campaign_id: row.meta_campaign_id, amount: sale.amount, status: sale.status } : null;
            })
            .filter((sale: DiagnosticAttributedSale | null): sale is DiagnosticAttributedSale => sale !== null);
        }
      }
    } catch (attributionIssue) {
      const message = attributionIssue instanceof Error ? attributionIssue.message : String(attributionIssue);
      console.error("diagnostic: attribution data unavailable (étage 3 ignoré)", message);
      warnings.push(`Étage 3 (attribution) indisponible : ${message}`);
    }

    const reports = computeCampaignDiagnostics((insightRows ?? []) as DiagnosticInsightRow[], attributedSales, { from, to });
    return { currency: account.currency ?? "XOF", reports, warnings };
  } catch (unexpected) {
    // Filet de sécurité : l'endpoint ne doit jamais crasher en 500 sans explication.
    const message = unexpected instanceof Error ? unexpected.message : String(unexpected);
    console.error("diagnostic: unexpected failure", message);
    return { error: { message, status: 500 } };
  }
}
