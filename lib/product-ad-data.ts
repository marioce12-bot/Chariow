import { fetchAllPages } from "./paginated-query";
import type {
  AdProfitAccount,
  AdProfitCampaign,
  AdProfitCampaignProductLink,
  AdProfitInsight,
  AdProfitProduct,
  ProductAdProfitInput,
} from "./product-ad-profit";

const PAGE_SIZE = 1000;
const MAX_ROWS = 20_000;

type ProductAdDataLoad = {
  data: Pick<ProductAdProfitInput, "products" | "campaigns" | "links" | "accounts" | "insights" | "since" | "until">;
  status: "available" | "partial" | "unavailable";
  errors: string[];
};
const message = (error: unknown) => error instanceof Error ? error.message : String((error as any)?.message ?? error ?? "Erreur de lecture");

/**
 * Read-only, store-scoped loader for the product-ad-profit calculation. The returned rows contain
 * product/campaign/account/aggregated insight fields only; Meta tokens and customer-level sales are never selected.
 */
export async function loadProductAdData(
  supabase: any,
  userId: string,
  storeId: string,
  since: string,
  until: string,
  productCatalog?: Array<string | { productId: string; productName?: string | null }>,
): Promise<ProductAdDataLoad> {
  const errors: string[] = [];
  const empty = (): ProductAdDataLoad => ({ data: { products: [], campaigns: [], links: [], accounts: [], insights: [], since, until }, status: "unavailable", errors });

  const { data: ownedStore, error: storeError } = await supabase.from("stores").select("id").eq("id", storeId).eq("user_id", userId).maybeSingle();
  if (storeError || !ownedStore) { errors.push("Boutique indisponible ou non autorisée."); return empty(); }

  // No products/chariow_products table exists in this project's migrations. Build a minimal
  // catalogue from store-owned sale product IDs (not raw payloads/customer data).
  let productNames = new Map<string, string>();
  let productIds: Set<string>;
  if (productCatalog) {
    productIds = new Set(productCatalog.map(p => typeof p === "string" ? p : p.productId).filter((id): id is string => !!id));
    productNames = new Map(productCatalog.filter((p): p is { productId: string; productName?: string | null } => typeof p !== "string" && !!p.productName).map(p => [p.productId, p.productName!]));
  } else {
    const salesProducts = await fetchAllPages<any>(async (from, to) => {
      const { data, error } = await supabase.from("chariow_sales").select("product_id")
        .eq("store_id", storeId).order("product_id", { ascending: true }).range(from, to);
      return { data, error };
    }, PAGE_SIZE, MAX_ROWS);
    if (salesProducts.error) { errors.push(`IDs produits du magasin indisponibles: ${message(salesProducts.error)}`); return empty(); }
    productIds = new Set<string>(salesProducts.rows.map((r: any) => r.product_id).filter((id: unknown): id is string => typeof id === "string" && !!id));
  }

  const [adRead, linkRead, accountRead, integrationRead] = await Promise.all([
    fetchAllPages<any>(async (from, to) => {
      const { data, error } = await supabase.from("ad_campaigns")
        .select("id,product_id,platform,destination_url,external_campaign_id,meta_ad_account_id")
        .eq("user_id", userId).eq("store_id", storeId).eq("platform", "meta")
        .order("id", { ascending: true }).range(from, to);
      return { data, error };
    }, PAGE_SIZE, MAX_ROWS),
    fetchAllPages<any>(async (from, to) => {
      // campaign_product_links has no store_id (verified migration); scope through its
      // campaign's owned Meta account below, then reject product IDs outside this store.
      const { data, error } = await supabase.from("campaign_product_links")
        .select("meta_campaign_id,product_id,product_url,user_id")
        .eq("user_id", userId).order("meta_campaign_id", { ascending: true }).range(from, to);
      return { data, error };
    }, PAGE_SIZE, MAX_ROWS),
    fetchAllPages<any>(async (from, to) => {
      const { data, error } = await supabase.from("meta_ad_accounts")
        .select("id,user_id,store_id,currency,last_synced_at,last_sync_error,insights_sync_complete,insights_sync_from,insights_sync_to,is_active,meta_integration_id")
        .eq("user_id", userId).eq("is_active", true)
        .order("id", { ascending: true }).range(from, to);
      return { data, error };
    }, PAGE_SIZE, MAX_ROWS),
    fetchAllPages<any>(async (from, to) => {
      const { data, error } = await supabase.from("meta_integrations")
        .select("id,user_id,is_active,last_error").eq("user_id", userId)
        .order("id", { ascending: true }).range(from, to);
      return { data, error };
    }, PAGE_SIZE, MAX_ROWS),
  ]);
  for (const [label, result] of [["Campagnes", adRead], ["Liens", linkRead], ["Comptes Meta", accountRead], ["Intégrations Meta", integrationRead]] as const) {
    if (result.error) errors.push(`${label} indisponibles: ${message(result.error)}`);
  }
  if (adRead.error || linkRead.error || accountRead.error) return empty();

  const campaignAccountIds = new Set(adRead.rows.map((c: any) => c.meta_ad_account_id).filter(Boolean).map(String));
  const accountsRaw = accountRead.rows.filter((a: any) => a.store_id === storeId || campaignAccountIds.has(String(a.id)));
  const accountIds = new Set(accountsRaw.map((a: any) => String(a.id)));
  const integrations = new Map<string, any>(integrationRead.rows.map((i: any) => [String(i.id), i]));
  const accounts: AdProfitAccount[] = accountsRaw.map((a: any) => {
    const integration = a.meta_integration_id ? integrations.get(String(a.meta_integration_id)) : null;
    // A persisted invalidation/error makes the account unusable; do not trigger re-auth here.
    const integrationUnavailable = !!a.meta_integration_id && (!integration || !integration.is_active || !!integration.last_error);
    return {
      id: String(a.id), currency: String(a.currency ?? ""), lastSyncedAt: a.last_synced_at ?? null,
      syncError: [a.last_sync_error, integrationRead.error ? "État d'intégration Meta illisible" : null, integrationUnavailable ? (integration?.last_error ?? "Intégration Meta indisponible") : null].filter(Boolean).join("; ") || null,
      syncComplete: integrationUnavailable || !!integrationRead.error ? false : a.insights_sync_complete ?? null,
      syncedFrom: a.insights_sync_from ?? null, syncedTo: a.insights_sync_to ?? null,
    };
  });

  const campaignRead = accountIds.size ? await fetchAllPages<any>(async (from, to) => {
    const { data, error } = await supabase.from("meta_campaigns")
      .select("id,ad_account_id,meta_campaign_id").in("ad_account_id", accountsRaw.map((a: any) => a.id).filter((id: string) => accountIds.has(id)))
      .order("id", { ascending: true }).range(from, to);
    return { data, error };
  }, PAGE_SIZE, MAX_ROWS) : { rows: [], error: null };
  if (campaignRead.error) { errors.push(`Campagnes Meta indisponibles: ${message(campaignRead.error)}`); return empty(); }
  const metaCampaignByInternal = new Map<string, any>(campaignRead.rows.map((c: any) => [String(c.id), c]));
  const metaCampaignByExternal = new Map<string, any[]>();
  for (const c of campaignRead.rows) {
    const key = String(c.meta_campaign_id), list = metaCampaignByExternal.get(key) ?? [];
    list.push(c); metaCampaignByExternal.set(key, list);
  }
  const campaigns: AdProfitCampaign[] = [];
  const campaignDataByMeta = new Map<string, any[]>();
  for (const row of adRead.rows) {
    if (row.product_id) productIds.add(String(row.product_id));
    const accountId = row.meta_ad_account_id ? String(row.meta_ad_account_id) : null;
    const candidates = row.external_campaign_id ? (metaCampaignByExternal.get(String(row.external_campaign_id)) ?? []) : [];
    const mc = accountId ? candidates.find((candidate: any) => String(candidate.ad_account_id) === accountId) : candidates.length === 1 ? candidates[0] : null;
    if (!row.external_campaign_id) continue;
    // Keep a launched, explicitly linked campaign even when its Meta catalogue/account is missing.
    // Dropping it could falsely turn a partial spend total into complete product profit.
    const c: AdProfitCampaign = { id: String(row.id), productId: row.product_id == null ? null : String(row.product_id), destinationUrl: row.destination_url ?? null, metaCampaignId: String(row.external_campaign_id), accountId: accountId ?? (mc ? String(mc.ad_account_id) : null) };
    campaigns.push(c);
    if (mc) { const list = campaignDataByMeta.get(String(mc.id)) ?? []; list.push(c); campaignDataByMeta.set(String(mc.id), list); }
  }
  const links: AdProfitCampaignProductLink[] = [];
  for (const row of linkRead.rows) {
    const mc = metaCampaignByInternal.get(String(row.meta_campaign_id));
    const campaignRows = campaignDataByMeta.get(String(mc?.id)) ?? [];
    const storeOwnedAccount = accountsRaw.some((a: any) => String(a.id) === String(mc?.ad_account_id) && a.store_id === storeId);
    // A NULL-store account is in scope only through this store's explicit ad_campaign FK;
    // do not pull other links/campaigns from a potentially shared account.
    if (!mc || !accountIds.has(String(mc.ad_account_id)) || (!storeOwnedAccount && !campaignRows.length) || (!campaignRows.length && !productIds.has(String(row.product_id)))) continue;
    if (row.product_id) productIds.add(String(row.product_id));
    const list = campaignRows;
    // For an ad_campaign row, the helper indexes links by that campaign's id;
    // use it rather than the meta_campaigns FK so the two association sources join.
    const matchingAdCampaigns = list.length ? list : [{ id: String(mc.id) }];
    for (const campaign of matchingAdCampaigns) links.push({ campaignId: campaign.id, productId: String(row.product_id), productUrl: row.product_url ?? null });
    // Preserve explicit link-only campaigns in the helper's campaign-to-product association.
    if (!list.length) {
      const c: AdProfitCampaign = { id: String(mc.id), productId: null, metaCampaignId: String(mc.meta_campaign_id), accountId: String(mc.ad_account_id) };
      campaigns.push(c); list.push(c); campaignDataByMeta.set(String(mc.id), list);
    }
  }

  const productUrls = new Map<string, string>();
  for (const c of campaigns) if (c.productId && c.destinationUrl && !productUrls.has(c.productId)) productUrls.set(c.productId, c.destinationUrl);
  for (const link of links) if (link.productUrl && !productUrls.has(link.productId)) productUrls.set(link.productId, link.productUrl);
  const products: AdProfitProduct[] = [...productIds].map(id => ({ id, chariowProductId: id, name: productNames.get(id) ?? null, destinationUrl: productUrls.get(id) ?? null }));

  const insightRead = accountIds.size ? await fetchAllPages<any>(async (from, to) => {
    const { data, error } = await supabase.from("meta_insights_daily")
      .select("ad_account_id,level,entity_id,date_start,date_stop,spend,conversions,conversion_value")
      .in("ad_account_id", [...accountIds]).eq("level", "campaign")
      .gte("date_start", since).lte("date_start", until)
      .order("date_start", { ascending: true }).order("entity_id", { ascending: true }).range(from, to);
    return { data, error };
  }, PAGE_SIZE, MAX_ROWS) : { rows: [], error: null };
  if (insightRead.error) {
    errors.push(`Statistiques Meta indisponibles: ${message(insightRead.error)}`);
    for (const account of accounts) { account.syncComplete = false; account.syncError = [account.syncError, "Lecture paginée des statistiques incomplète"].filter(Boolean).join("; "); }
  }
  const insights: AdProfitInsight[] = insightRead.rows
    .filter((r: any) => (metaCampaignByExternal.get(String(r.entity_id)) ?? []).some((c: any) => String(c.ad_account_id) === String(r.ad_account_id)) || campaigns.some(c => c.metaCampaignId === String(r.entity_id) && c.accountId === String(r.ad_account_id)))
    .map((r: any) => ({ accountId: String(r.ad_account_id), level: String(r.level), entityId: String(r.entity_id), dateStart: String(r.date_start), dateStop: r.date_stop ?? null, spend: r.spend ?? null, conversions: r.conversions ?? null, conversionValue: r.conversion_value ?? null }));
  return { data: { products, campaigns, links, accounts, insights, since, until }, status: errors.length ? (insights.length || campaigns.length ? "partial" : "unavailable") : "available", errors };
}
