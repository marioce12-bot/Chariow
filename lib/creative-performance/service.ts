import { convertCurrency } from "@/lib/currency";
import { isConfirmedChariowSaleStatus } from "@/lib/chariow/sales";
import { decryptSecret } from "@/lib/crypto";
import { fetchPinterestAdReport, fetchPinterestCampaignReport } from "@/lib/pinterest/report";
import { fetchTikTokAdReport, fetchTikTokCampaignReport } from "@/lib/tiktok/report";
import { resolveUniqueSaleCampaignLinks } from "./attribution";
import { findQuasiDuplicates } from "./similarity";

const PAGE_SIZE = 1000;
const PAGE_LIMIT = 20;
const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const cents = (value: number) => Math.round(value * 100) / 100;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export type CreativePeriod = { from: string; to: string };
export type CreativeMetric = {
  available: boolean;
  scope: "ad" | "campaign" | "unavailable";
  currency: string | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  platformConversions: number | null;
  platformConversionValue: number | null;
  attributedOrders: number | null;
  attributedRevenue: number | null;
  attributedCurrency: string | null;
  attributionReliable: boolean;
};

type CampaignRow = {
  id: string; store_id: string; product_id: string | null; product_name: string | null;
  platform: "meta" | "tiktok" | "pinterest"; status: string; title: string | null;
  media_url: string | null; carousel_urls: unknown; external_campaign_id: string | null;
  external_ad_id: string | null; meta_ad_account_id: string | null; tiktok_ad_account_id: string | null;
  pinterest_ad_account_id: string | null;
};
type Placement = {
  id: string; asset_id: string; ad_campaign_id: string | null; campaign_key: string;
  campaign_name_snapshot: string; platform: "meta" | "tiktok" | "pinterest";
  product_id: string | null; product_name_snapshot: string | null; variant_label: string | null;
  campaign_status_snapshot: string | null; external_campaign_id: string | null; external_ad_id: string | null;
  is_multi_media: boolean; asset_index: number;
};
type Insight = {
  ad_account_id: string; level: string; entity_id: string; impressions: number | string | null;
  clicks: number | string | null; spend: number | string | null; conversions: number | string | null;
  conversion_value: number | string | null;
};
type SalesRow = {
  chariow_sale_id: string; chariow_campaign_id?: string | null; status: string;
  amount: number | string | null; net_amount: number | string | null; currency: string | null;
  occurred_at: string | null;
};
type MetricAccumulator = {
  scope: "ad" | "campaign"; currency: string | null; spend: number; impressions: number;
  clicks: number; conversions: number; conversionValue: number | null; hasRows: boolean;
};

function validDate(value: string | null, fallback: string): string {
  if (!value || !datePattern.test(value)) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : fallback;
}

export function parseCreativePeriod(params: URLSearchParams, now = new Date()): CreativePeriod {
  const to = validDate(params.get("to"), now.toISOString().slice(0, 10));
  const defaultDays = Math.min(90, Math.max(1, Number(params.get("days")) || 30));
  const fallback = new Date(`${to}T00:00:00.000Z`);
  fallback.setUTCDate(fallback.getUTCDate() - defaultDays + 1);
  const from = validDate(params.get("from"), fallback.toISOString().slice(0, 10));
  if (from > to) throw new Error("La date de début doit précéder la date de fin.");
  const span = Math.floor((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86400000) + 1;
  if (span > 90) throw new Error("La période maximale est de 90 jours.");
  return { from, to };
}

async function readPages<T>(queryFactory: (from: number, to: number) => any): Promise<T[]> {
  const result: T[] = [];
  for (let page = 0; page < PAGE_LIMIT; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await queryFactory(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    result.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return result;
}

async function readPagesIn<T>(values: string[], queryFactory: (ids: string[], from: number, to: number) => any): Promise<T[]> {
  const result: T[] = [];
  const unique = [...new Set(values)];
  for (let index = 0; index < unique.length; index += 100) {
    const ids = unique.slice(index, index + 100);
    result.push(...await readPages<T>((from, to) => queryFactory(ids, from, to)));
  }
  return result;
}

function emptyMetric(): CreativeMetric {
  return {
    available: false, scope: "unavailable", currency: null, spend: null, impressions: null,
    clicks: null, platformConversions: null, platformConversionValue: null,
    attributedOrders: null, attributedRevenue: null, attributedCurrency: null,
    attributionReliable: false,
  };
}

function addReportMetric(
  target: Map<string, MetricAccumulator>, key: string,
  row: { impressions?: unknown; clicks?: unknown; spend?: unknown; conversions?: unknown; conversionValue?: unknown },
  scope: "ad" | "campaign", currency: string | null,
) {
  const metric = target.get(key) ?? {
    scope, currency, spend: 0, impressions: 0, clicks: 0, conversions: 0,
    conversionValue: null, hasRows: false,
  };
  metric.spend += num(row.spend);
  metric.impressions += num(row.impressions);
  metric.clicks += num(row.clicks);
  metric.conversions += num(row.conversions);
  if (row.conversionValue !== null && row.conversionValue !== undefined) {
    metric.conversionValue = (metric.conversionValue ?? 0) + num(row.conversionValue);
  }
  metric.hasRows = true;
  target.set(key, metric);
}

function addInsight(target: Map<string, MetricAccumulator>, key: string, row: Insight, scope: "ad" | "campaign", currency: string | null) {
  addReportMetric(target, key, {
    impressions: row.impressions, clicks: row.clicks, spend: row.spend,
    conversions: row.conversions, conversionValue: row.conversion_value,
  }, scope, currency);
}

function metricKey(campaignKey: string) { return campaignKey; }

async function readMetaAttribution(supabase: any, userId: string, storeId: string, campaigns: CampaignRow[], from: string, to: string, metaCurrencyByAccount: Map<string, string>) {
  const metaCampaigns = campaigns.filter((row) => row.platform === "meta" && row.external_campaign_id && row.meta_ad_account_id);
  const campaignIds = [...new Set(metaCampaigns.map((row) => row.external_campaign_id!))];
  const empty = new Map<string, { orders: number | null; revenue: number | null; currency: string | null; reliable: boolean }>();
  if (!campaignIds.length) return { byCampaign: empty, assignedSaleIds: new Set<string>() };

  const directLinks = await readPagesIn<{ chariow_sale_id: string; meta_campaign_id: string }>(campaignIds, (ids, start, end) => supabase.from("meta_attributions")
    .select("chariow_sale_id,meta_campaign_id")
    .eq("user_id", userId).eq("store_id", storeId)
    .gte("attributed_at", `${from}T00:00:00.000Z`).lte("attributed_at", `${to}T23:59:59.999Z`)
    .in("meta_campaign_id", ids).not("chariow_sale_id", "is", null)
    .order("attributed_at", { ascending: true }).range(start, end));

  const { data: mappingRows, error: mappingError } = await supabase.from("meta_campaign_mappings")
    .select("meta_campaign_id,chariow_campaign_id,mapping_level,status")
    .eq("user_id", userId).eq("store_id", storeId).eq("status", "active").eq("mapping_level", "campaign");
  if (mappingError) throw mappingError;
  const mappings = (mappingRows ?? []) as Array<{ meta_campaign_id: string; chariow_campaign_id: string }>;
  const nativeOwners = new Map<string, Set<string>>();
  for (const mapping of mappings) {
    const set = nativeOwners.get(mapping.chariow_campaign_id) ?? new Set<string>();
    set.add(mapping.meta_campaign_id);
    nativeOwners.set(mapping.chariow_campaign_id, set);
  }
  const relevantMappings = mappings.filter((mapping) => campaignIds.includes(mapping.meta_campaign_id));
  const nativeIds = [...new Set(relevantMappings.map((mapping) => mapping.chariow_campaign_id))];
  let nativeSales: SalesRow[] = [];
  if (nativeIds.length) {
    nativeSales = await readPagesIn<SalesRow>(nativeIds, (ids, start, end) => supabase.from("chariow_sales")
      .select("chariow_sale_id,chariow_campaign_id,status,amount,net_amount,currency,occurred_at")
      .eq("store_id", storeId).in("chariow_campaign_id", ids)
      .gte("occurred_at", `${from}T00:00:00.000Z`).lte("occurred_at", `${to}T23:59:59.999Z`)
      .order("occurred_at", { ascending: true }).range(start, end));
  }
  const saleIds = [...new Set([...directLinks.map((row) => row.chariow_sale_id), ...nativeSales.map((row) => row.chariow_sale_id)])];
  const saleById = new Map<string, SalesRow>();
  if (saleIds.length) {
    const sales = await readPagesIn<SalesRow>(saleIds, (ids, start, end) => supabase.from("chariow_sales")
      .select("chariow_sale_id,chariow_campaign_id,status,amount,net_amount,currency,occurred_at")
      .eq("store_id", storeId).in("chariow_sale_id", ids)
      .gte("occurred_at", `${from}T00:00:00.000Z`).lte("occurred_at", `${to}T23:59:59.999Z`)
      .range(start, end));
    for (const sale of sales) saleById.set(sale.chariow_sale_id, sale);
  }
  const confirmedSaleIds = new Set([...saleById.values()].filter((sale) => isConfirmedChariowSaleStatus(sale.status)).map((sale) => sale.chariow_sale_id));
  const directAssignments = resolveUniqueSaleCampaignLinks(directLinks.map((link) => ({ saleId: link.chariow_sale_id, campaignId: link.meta_campaign_id })), confirmedSaleIds);
  const linksByCampaign = new Map<string, Map<string, SalesRow>>();
  for (const [campaignId, saleIdsForCampaign] of directAssignments.saleIdsByCampaign) {
    linksByCampaign.set(campaignId, new Map([...saleIdsForCampaign].flatMap((saleId) => {
      const sale = saleById.get(saleId);
      return sale ? [[saleId, sale] as const] : [];
    })));
  }
  const assignedSales = directAssignments.assignedSaleIds;
  const ambiguousCampaignIds = directAssignments.ambiguousCampaignIds;
  for (const sale of nativeSales) {
    const nativeId = sale.chariow_campaign_id ?? "";
    const owners = nativeOwners.get(nativeId);
    if (!owners || owners.size !== 1 || assignedSales.has(sale.chariow_sale_id) || !isConfirmedChariowSaleStatus(sale.status)) continue;
    const metaId = [...owners][0];
    const rows = linksByCampaign.get(metaId) ?? new Map<string, SalesRow>();
    rows.set(sale.chariow_sale_id, sale);
    linksByCampaign.set(metaId, rows);
    assignedSales.add(sale.chariow_sale_id);
  }

  for (const campaign of metaCampaigns) {
    const campaignId = campaign.external_campaign_id!;
    const hasReliableLink = directLinks.some((row) => row.meta_campaign_id === campaignId) || relevantMappings.some((row) => row.meta_campaign_id === campaignId);
    if (!hasReliableLink) continue;
    const currency = metaCurrencyByAccount.get(campaign.meta_ad_account_id!) ?? null;
    if (ambiguousCampaignIds.has(campaignId)) {
      empty.set(campaign.id, { orders: null, revenue: null, currency, reliable: false });
      continue;
    }
    let revenue = 0;
    let reliable = Boolean(currency);
    const sales = linksByCampaign.get(campaignId) ?? new Map<string, SalesRow>();
    for (const sale of sales.values()) {
      const converted = sale.currency && currency ? convertCurrency(num(sale.net_amount), sale.currency, currency) : null;
      if (converted === null) { reliable = false; continue; }
      revenue += converted;
    }
    empty.set(campaign.id, {
      orders: reliable ? sales.size : null,
      revenue: reliable ? cents(revenue) : null,
      currency,
      reliable,
    });
  }
  return { byCampaign: empty, assignedSaleIds: assignedSales };
}

async function readTikTokAttribution(
  supabase: any, userId: string, storeId: string, campaigns: CampaignRow[], from: string, to: string,
  currencyByAccount: Map<string, string>, alreadyAssigned: Set<string>,
) {
  const rows = campaigns.filter((row) => row.platform === "tiktok" && row.external_campaign_id && row.tiktok_ad_account_id);
  const campaignIds = [...new Set(rows.map((row) => row.external_campaign_id!))];
  const result = new Map<string, { orders: number | null; revenue: number | null; currency: string | null; reliable: boolean }>();
  if (!campaignIds.length) return result;
  const { data: mappingRows, error: mappingError } = await supabase.from("tiktok_campaign_mappings")
    .select("tiktok_campaign_id,chariow_campaign_id,mapping_level,status")
    .eq("user_id", userId).eq("store_id", storeId).eq("status", "active")
    .eq("mapping_level", "campaign").in("tiktok_campaign_id", campaignIds);
  if (mappingError) throw mappingError;
  const mappings = (mappingRows ?? []) as Array<{ tiktok_campaign_id: string; chariow_campaign_id: string }>;
  const nativeOwners = new Map<string, Set<string>>();
  const nativeByExternal = new Map<string, Set<string>>();
  for (const mapping of mappings) {
    const owners = nativeOwners.get(mapping.chariow_campaign_id) ?? new Set<string>();
    owners.add(mapping.tiktok_campaign_id); nativeOwners.set(mapping.chariow_campaign_id, owners);
    const nativeIds = nativeByExternal.get(mapping.tiktok_campaign_id) ?? new Set<string>();
    nativeIds.add(mapping.chariow_campaign_id); nativeByExternal.set(mapping.tiktok_campaign_id, nativeIds);
  }
  const appRowsByExternal = new Map<string, CampaignRow[]>();
  for (const row of rows) {
    const list = appRowsByExternal.get(row.external_campaign_id!) ?? [];
    list.push(row); appRowsByExternal.set(row.external_campaign_id!, list);
  }
  const eligible = new Map<string, { campaign: CampaignRow; nativeId: string; currency: string | null }>();
  for (const [externalId, nativeIds] of nativeByExternal) {
    const nativeId = [...nativeIds][0];
    const appRows = appRowsByExternal.get(externalId) ?? [];
    if (nativeIds.size !== 1 || nativeOwners.get(nativeId)?.size !== 1 || appRows.length !== 1) continue;
    const campaign = appRows[0];
    const currency = currencyByAccount.get(campaign.tiktok_ad_account_id!) ?? null;
    if (currency) eligible.set(campaign.id, { campaign, nativeId, currency });
  }
  if (!eligible.size) return result;
  const nativeIds = [...new Set([...eligible.values()].map((row) => row.nativeId))];
  const sales = await readPagesIn<SalesRow>(nativeIds, (ids, start, end) => supabase.from("chariow_sales")
    .select("chariow_sale_id,chariow_campaign_id,status,amount,net_amount,currency,occurred_at")
    .eq("store_id", storeId).in("chariow_campaign_id", ids)
    .gte("occurred_at", `${from}T00:00:00.000Z`).lte("occurred_at", `${to}T23:59:59.999Z`)
    .order("occurred_at", { ascending: true }).range(start, end));
  const eligibleByNative = new Map([...eligible.entries()].map(([campaignId, value]) => [value.nativeId, campaignId]));
  const salesByCampaign = new Map<string, Map<string, SalesRow>>();
  for (const campaignId of eligible.keys()) salesByCampaign.set(campaignId, new Map());
  for (const sale of sales) {
    const campaignId = eligibleByNative.get(sale.chariow_campaign_id ?? "");
    if (!campaignId || alreadyAssigned.has(sale.chariow_sale_id) || !isConfirmedChariowSaleStatus(sale.status)) continue;
    salesByCampaign.get(campaignId)?.set(sale.chariow_sale_id, sale);
  }
  for (const [campaignId, value] of eligible) {
    const selected = salesByCampaign.get(campaignId) ?? new Map<string, SalesRow>();
    let revenue = 0;
    let reliable = true;
    for (const sale of selected.values()) {
      const converted = sale.currency ? convertCurrency(num(sale.net_amount), sale.currency, value.currency!) : null;
      if (converted === null) reliable = false;
      else revenue += converted;
    }
    result.set(campaignId, reliable
      ? { orders: selected.size, revenue: cents(revenue), currency: value.currency, reliable: true }
      : { orders: null, revenue: null, currency: null, reliable: false });
  }
  return result;
}

export async function loadCreativePerformance(input: {
  supabase: any; userId: string; storeId: string; period: CreativePeriod;
  persistSnapshots?: boolean;
}) {
  const { supabase, userId, storeId, period } = input;
  const campaigns = await readPages<CampaignRow>((start, end) => supabase.from("ad_campaigns")
    .select("id,store_id,product_id,product_name,platform,status,title,media_url,carousel_urls,external_campaign_id,external_ad_id,meta_ad_account_id,tiktok_ad_account_id,pinterest_ad_account_id")
    .eq("user_id", userId).eq("store_id", storeId).order("created_at", { ascending: false }).range(start, end));
  const placements = await readPages<Placement>((start, end) => supabase.from("creative_media_placements")
    .select("id,asset_id,ad_campaign_id,campaign_key,campaign_name_snapshot,platform,product_id,product_name_snapshot,variant_label,campaign_status_snapshot,external_campaign_id,external_ad_id,is_multi_media,asset_index")
    .eq("user_id", userId).eq("store_id", storeId).order("created_at", { ascending: false }).range(start, end));
  const assetIds = [...new Set(placements.map((row) => row.asset_id))];
  const assets = assetIds.length ? await readPages<any>((start, end) => supabase.from("creative_media_assets")
    .select("id,kind,sha256,perceptual_hash,keyframe_hashes,source_url,delivery_url,file_size,created_at")
    .eq("user_id", userId).in("id", assetIds).order("created_at", { ascending: false }).range(start, end)) : [];
  const assetById = new Map<string, any>(assets.map((row: any) => [row.id, row]));

  const metaAccountIds = [...new Set(campaigns.map((row) => row.meta_ad_account_id).filter(Boolean))] as string[];
  const metaCurrencyByAccount = new Map<string, string>();
  if (metaAccountIds.length) {
    const { data: accounts, error } = await supabase.from("meta_ad_accounts").select("id,currency").eq("user_id", userId).in("id", metaAccountIds);
    if (error) throw error;
    for (const account of accounts ?? []) metaCurrencyByAccount.set(account.id, String(account.currency ?? "").toUpperCase());
  }
  const accountIdsForInsights = metaAccountIds;
  const adIds = [...new Set(campaigns.filter((row) => row.platform === "meta").map((row) => row.external_ad_id).filter(Boolean))] as string[];
  const metaCampaignIds = [...new Set(campaigns.filter((row) => row.platform === "meta").map((row) => row.external_campaign_id).filter(Boolean))] as string[];
  const insightByEntity = new Map<string, MetricAccumulator>();
  if (accountIdsForInsights.length && (adIds.length || metaCampaignIds.length)) {
    for (const level of ["ad", "campaign"] as const) {
      const ids = level === "ad" ? adIds : metaCampaignIds;
      if (!ids.length) continue;
      const insights = await readPages<Insight>((start, end) => supabase.from("meta_insights_daily")
        .select("ad_account_id,level,entity_id,impressions,clicks,spend,conversions,conversion_value")
        .eq("level", level).in("ad_account_id", accountIdsForInsights).in("entity_id", ids)
        .gte("date_start", period.from).lte("date_start", period.to).order("date_start").range(start, end));
      for (const row of insights) {
        const currency = metaCurrencyByAccount.get(row.ad_account_id) ?? null;
        addInsight(insightByEntity, `${row.ad_account_id}:${level}:${row.entity_id}`, row, level, currency);
      }
    }
  }

  const providerCampaignKey = (platform: "tiktok" | "pinterest", accountId: string, externalId: string) => `${platform}:${accountId}:${externalId}`;
  const providerAdKey = (platform: "tiktok" | "pinterest", accountId: string, externalId: string) => `${platform}:${accountId}:${externalId}`;
  const tiktokByCampaign = new Map<string, MetricAccumulator>();
  const tiktokByAd = new Map<string, MetricAccumulator>();
  const tiktokCurrencyByAccount = new Map<string, string>();
  const tiktokAccountIds = [...new Set(campaigns.filter((row) => row.platform === "tiktok").map((row) => row.tiktok_ad_account_id).filter(Boolean))] as string[];
  const tiktokErrors: string[] = [];
  if (tiktokAccountIds.length) {
    const { data: accounts, error: accountError } = await supabase.from("tiktok_ad_accounts")
      .select("id,tiktok_advertiser_id,tiktok_integration_id,currency,is_active").eq("user_id", userId).in("id", tiktokAccountIds);
    if (accountError) throw accountError;
    if ((accounts ?? []).length < tiktokAccountIds.length) tiktokErrors.push("Compte TikTok Ads introuvable");
    for (const account of accounts ?? []) tiktokCurrencyByAccount.set(account.id, String(account.currency ?? "").toUpperCase());
    const integrationIds = [...new Set((accounts ?? []).map((row: any) => row.tiktok_integration_id).filter(Boolean))] as string[];
    const { data: integrations, error: integrationError } = integrationIds.length
      ? await supabase.from("tiktok_integrations").select("id,access_token_encrypted,is_active").eq("user_id", userId).in("id", integrationIds)
      : { data: [], error: null };
    if (integrationError) throw integrationError;
    const integrationById = new Map((integrations ?? []).map((row: any) => [row.id, row]));
    for (const account of accounts ?? []) {
      const integration: any = integrationById.get(account.tiktok_integration_id);
      if (!account.is_active || !integration?.is_active) { tiktokErrors.push("Connexion TikTok Ads inactive"); continue; }
      let accessToken: string;
      try { accessToken = decryptSecret(integration.access_token_encrypted); }
      catch { tiktokErrors.push("Jeton TikTok Ads indisponible"); continue; }
      const currency = String(account.currency ?? "").toUpperCase() || null;
      try {
        const report = await fetchTikTokCampaignReport(account.tiktok_advertiser_id, accessToken, period.from, period.to);
        for (const row of report) addReportMetric(tiktokByCampaign, providerCampaignKey("tiktok", account.id, row.id), row, "campaign", currency);
      } catch { tiktokErrors.push("Rapport TikTok Ads indisponible"); }
      const adIds = [...new Set(campaigns.filter((row) => row.platform === "tiktok" && row.tiktok_ad_account_id === account.id).map((row) => row.external_ad_id).filter(Boolean))] as string[];
      if (adIds.length) {
        try {
          const report = await fetchTikTokAdReport(account.tiktok_advertiser_id, accessToken, period.from, period.to);
          for (const row of report) addReportMetric(tiktokByAd, providerAdKey("tiktok", account.id, row.id), row, "ad", currency);
        } catch { tiktokErrors.push("Rapport TikTok Ads par annonce indisponible"); }
      }
    }
  }

  const pinterestByCampaign = new Map<string, MetricAccumulator>();
  const pinterestByAd = new Map<string, MetricAccumulator>();
  const pinterestAccountIds = [...new Set(campaigns.filter((row) => row.platform === "pinterest").map((row) => row.pinterest_ad_account_id).filter(Boolean))] as string[];
  const pinterestErrors: string[] = [];
  if (pinterestAccountIds.length) {
    const { data: accounts, error: accountError } = await supabase.from("pinterest_ad_accounts")
      .select("id,pinterest_ad_account_id,pinterest_integration_id,currency,is_active").eq("user_id", userId).in("id", pinterestAccountIds);
    if (accountError) throw accountError;
    if ((accounts ?? []).length < pinterestAccountIds.length) pinterestErrors.push("Compte Pinterest Ads introuvable");
    const integrationIds = [...new Set((accounts ?? []).map((row: any) => row.pinterest_integration_id).filter(Boolean))] as string[];
    const { data: integrations, error: integrationError } = integrationIds.length
      ? await supabase.from("pinterest_integrations").select("id,access_token_encrypted,is_active").eq("user_id", userId).in("id", integrationIds)
      : { data: [], error: null };
    if (integrationError) throw integrationError;
    const integrationById = new Map((integrations ?? []).map((row: any) => [row.id, row]));
    for (const account of accounts ?? []) {
      const integration: any = integrationById.get(account.pinterest_integration_id);
      if (!account.is_active || !integration?.is_active) { pinterestErrors.push("Connexion Pinterest Ads inactive"); continue; }
      let accessToken: string;
      try { accessToken = decryptSecret(integration.access_token_encrypted); }
      catch { pinterestErrors.push("Jeton Pinterest Ads indisponible"); continue; }
      const currency = String(account.currency ?? "").toUpperCase() || null;
      try {
        const report = await fetchPinterestCampaignReport(account.pinterest_ad_account_id, accessToken, period.from, period.to);
        for (const row of report) addReportMetric(pinterestByCampaign, providerCampaignKey("pinterest", account.id, row.id), row, "campaign", currency);
      } catch { pinterestErrors.push("Rapport Pinterest Ads indisponible"); }
      const adIds = [...new Set(campaigns.filter((row) => row.platform === "pinterest" && row.pinterest_ad_account_id === account.id).map((row) => row.external_ad_id).filter(Boolean))] as string[];
      if (adIds.length) {
        try {
          const report = await fetchPinterestAdReport(account.pinterest_ad_account_id, accessToken, adIds, period.from, period.to);
          for (const row of report) addReportMetric(pinterestByAd, providerAdKey("pinterest", account.id, row.id), row, "ad", currency);
        } catch { pinterestErrors.push("Rapport Pinterest Ads par annonce indisponible"); }
      }
    }
  }

  const metaAttribution = await readMetaAttribution(supabase, userId, storeId, campaigns, period.from, period.to, metaCurrencyByAccount);
  const attributedByCampaign = new Map(metaAttribution.byCampaign);
  const tiktokAttribution = await readTikTokAttribution(supabase, userId, storeId, campaigns, period.from, period.to, tiktokCurrencyByAccount, metaAttribution.assignedSaleIds);
  for (const [campaignId, attribution] of tiktokAttribution) attributedByCampaign.set(campaignId, attribution);

  const providerCampaignOwnerCounts = new Map<string, number>();
  const providerAdOwners = new Map<string, CampaignRow[]>();
  for (const campaign of campaigns) {
    if (campaign.platform === "tiktok" && campaign.tiktok_ad_account_id) {
      if (campaign.external_campaign_id) {
        const key = providerCampaignKey("tiktok", campaign.tiktok_ad_account_id, campaign.external_campaign_id);
        providerCampaignOwnerCounts.set(key, (providerCampaignOwnerCounts.get(key) ?? 0) + 1);
      }
      if (campaign.external_ad_id) {
        const key = providerAdKey("tiktok", campaign.tiktok_ad_account_id, campaign.external_ad_id);
        providerAdOwners.set(key, [...(providerAdOwners.get(key) ?? []), campaign]);
      }
    }
    if (campaign.platform === "pinterest" && campaign.pinterest_ad_account_id) {
      if (campaign.external_campaign_id) {
        const key = providerCampaignKey("pinterest", campaign.pinterest_ad_account_id, campaign.external_campaign_id);
        providerCampaignOwnerCounts.set(key, (providerCampaignOwnerCounts.get(key) ?? 0) + 1);
      }
      if (campaign.external_ad_id) {
        const key = providerAdKey("pinterest", campaign.pinterest_ad_account_id, campaign.external_ad_id);
        providerAdOwners.set(key, [...(providerAdOwners.get(key) ?? []), campaign]);
      }
    }
  }

  const campaignMetricById = new Map<string, MetricAccumulator>();
  for (const campaign of campaigns) {
    if (!campaign.external_campaign_id) continue;
    let metric: MetricAccumulator | undefined;
    if (campaign.platform === "meta" && campaign.meta_ad_account_id) {
      const adKey = campaign.external_ad_id ? `${campaign.meta_ad_account_id}:ad:${campaign.external_ad_id}` : "";
      const campaignKey = `${campaign.meta_ad_account_id}:campaign:${campaign.external_campaign_id}`;
      metric = (adKey && insightByEntity.get(adKey)) || insightByEntity.get(campaignKey);
    } else if (campaign.platform === "tiktok" && campaign.tiktok_ad_account_id) {
      const key = providerCampaignKey("tiktok", campaign.tiktok_ad_account_id, campaign.external_campaign_id);
      if (providerCampaignOwnerCounts.get(key) === 1) metric = tiktokByCampaign.get(key);
    } else if (campaign.platform === "pinterest" && campaign.pinterest_ad_account_id) {
      const key = providerCampaignKey("pinterest", campaign.pinterest_ad_account_id, campaign.external_campaign_id);
      if (providerCampaignOwnerCounts.get(key) === 1) metric = pinterestByCampaign.get(key);
    }
    if (metric?.hasRows) campaignMetricById.set(campaign.id, metric);
  }

  const creativeMetricByCampaignId = new Map<string, MetricAccumulator>();
  for (const [key, owners] of providerAdOwners) {
    if (owners.length !== 1) continue;
    const campaign = owners[0];
    const metric = campaign.platform === "tiktok" ? tiktokByAd.get(key) : pinterestByAd.get(key);
    if (metric?.hasRows) creativeMetricByCampaignId.set(campaign.id, metric);
  }

  // Utiliser les anciens instantanés si un fournisseur ne répond plus, sans afficher des zéros fabriqués.
  const campaignKeys = campaigns.map((row) => row.id);
  const snapshots = campaignKeys.length ? await readPages<any>((start, end) => supabase.from("creative_campaign_metric_snapshots")
    .select("campaign_key,campaign_name_snapshot,platform,external_campaign_id,currency,impressions,clicks,spend,platform_conversions,platform_conversion_value,attributed_orders,attributed_revenue,attributed_currency,metric_scope")
    .eq("user_id", userId).eq("store_id", storeId).eq("period_from", period.from).eq("period_to", period.to)
    .in("campaign_key", campaignKeys).order("captured_at", { ascending: false }).range(start, end)) : [];
  for (const snapshot of snapshots) {
    if (snapshot.metric_scope === "unavailable") continue;
    const snapshotCampaign = campaigns.find((campaign) => campaign.id === snapshot.campaign_key);
    if (snapshotCampaign?.platform === "tiktok" || snapshotCampaign?.platform === "pinterest") {
      const accountId = snapshotCampaign.platform === "tiktok" ? snapshotCampaign.tiktok_ad_account_id : snapshotCampaign.pinterest_ad_account_id;
      if (accountId && snapshotCampaign.external_campaign_id) {
        const key = providerCampaignKey(snapshotCampaign.platform, accountId, snapshotCampaign.external_campaign_id);
        if (providerCampaignOwnerCounts.get(key) !== 1) continue;
      }
    }
    const currentAttribution = attributedByCampaign.get(snapshot.campaign_key);
    if ((!currentAttribution || !currentAttribution.reliable) && snapshot.attributed_orders !== null && snapshot.attributed_revenue !== null && snapshot.attributed_currency) {
      attributedByCampaign.set(snapshot.campaign_key, {
        orders: num(snapshot.attributed_orders), revenue: num(snapshot.attributed_revenue),
        currency: String(snapshot.attributed_currency), reliable: true,
      });
    }
    if (campaignMetricById.has(snapshot.campaign_key)) continue;
    campaignMetricById.set(snapshot.campaign_key, {
      scope: snapshot.metric_scope === "ad" ? "ad" : "campaign", currency: snapshot.currency,
      impressions: num(snapshot.impressions), clicks: num(snapshot.clicks), spend: num(snapshot.spend),
      conversions: num(snapshot.platform_conversions),
      conversionValue: snapshotCampaign?.platform === "meta" ? num(snapshot.platform_conversion_value) : null,
      hasRows: true,
    });
  }

  const launchedStatuses = new Set(["active", "paused", "autopilot_paused", "completed", "archived", "deleted"]);
  const placementCounts = new Map<string, number>();
  for (const placement of placements) placementCounts.set(placement.campaign_key, (placementCounts.get(placement.campaign_key) ?? 0) + 1);

  const metricFor = (campaign: CampaignRow | undefined, placement: Placement): CreativeMetric => {
    const noMetric = emptyMetric();
    if (!campaign || !campaign.external_campaign_id || !launchedStatuses.has(campaign.status)) return noMetric;
    if (placement.is_multi_media || (placementCounts.get(campaign.id) ?? 0) > 1) return noMetric;
    const row = campaign.platform === "meta"
      ? campaignMetricById.get(campaign.id)
      : creativeMetricByCampaignId.get(campaign.id);
    if (!row?.hasRows) return noMetric;
    const attributed = attributedByCampaign.get(campaign.id);
    const attribution = attributed?.reliable
      ? { orders: attributed.orders, revenue: attributed.revenue, currency: attributed.currency, reliable: true }
      : { orders: null, revenue: null, currency: null, reliable: false };
    return {
      available: true, scope: row.scope, currency: row.currency, spend: cents(row.spend),
      impressions: Math.round(row.impressions), clicks: Math.round(row.clicks),
      platformConversions: cents(row.conversions),
      platformConversionValue: row.conversionValue === null ? null : cents(row.conversionValue),
      attributedOrders: attribution.orders, attributedRevenue: attribution.revenue,
      attributedCurrency: attribution.currency, attributionReliable: attribution.reliable,
    };
  };

  // Persist only genuine provider observations; archived/deleted rows remain linked by campaign_key.
  const snapshotRows = campaigns.flatMap((campaign) => {
    const metric = campaignMetricById.get(campaign.id);
    if (!campaign.external_campaign_id || !metric?.hasRows) return [];
    const attributed = attributedByCampaign.get(campaign.id);
    return [{
      user_id: userId, store_id: storeId, ad_campaign_id: campaign.id, campaign_key: campaign.id,
      campaign_name_snapshot: campaign.title || campaign.product_name || campaign.product_id || campaign.id,
      platform: campaign.platform, external_campaign_id: campaign.external_campaign_id,
      period_from: period.from, period_to: period.to, currency: metric.currency,
      impressions: Math.round(metric.impressions), clicks: Math.round(metric.clicks), spend: cents(metric.spend),
      platform_conversions: cents(metric.conversions), platform_conversion_value: metric.conversionValue === null ? 0 : cents(metric.conversionValue),
      attributed_orders: attributed?.reliable ? attributed.orders : null,
      attributed_revenue: attributed?.reliable ? attributed.revenue : null,
      attributed_currency: attributed?.reliable ? attributed.currency : null,
      metric_scope: metric.scope,
    }];
  });
  if (input.persistSnapshots !== false && snapshotRows.length) {
    const { error } = await supabase.from("creative_campaign_metric_snapshots").upsert(snapshotRows, {
      onConflict: "user_id,store_id,platform,external_campaign_id,period_from,period_to",
    });
    if (error) console.warn("Creative campaign metrics snapshot not saved", error.message);
  }

  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const assetGroups = new Map<string, any[]>();
  const productEligibility = new Map<string, { productId: string; productName: string; launchedCampaigns: number; analyzedCampaigns: number; eligible: boolean }>();
  const campaignSummaries = campaigns.map((campaign) => {
    const metric = campaignMetricById.get(campaign.id);
    const attributed = attributedByCampaign.get(campaign.id);
    const eligible = Boolean(campaign.product_id && campaign.external_campaign_id && launchedStatuses.has(campaign.status) && metric?.hasRows && (metric.spend > 0 || metric.impressions > 0 || metric.clicks > 0));
    if (campaign.product_id) {
      const productId = campaign.product_id;
      const current = productEligibility.get(productId) ?? {
        productId, productName: campaign.product_name || campaign.title || productId,
        launchedCampaigns: 0, analyzedCampaigns: 0, eligible: false,
      };
      if (campaign.external_campaign_id && launchedStatuses.has(campaign.status)) current.launchedCampaigns += 1;
      if (eligible) current.analyzedCampaigns += 1;
      current.eligible ||= eligible;
      productEligibility.set(productId, current);
    }
    return {
      campaignId: campaign.id, name: campaign.title || campaign.product_name || campaign.product_id || campaign.id,
      platform: campaign.platform, status: campaign.status, productId: campaign.product_id,
      productName: campaign.product_name, launched: Boolean(campaign.external_campaign_id && launchedStatuses.has(campaign.status)),
      analyzed: eligible, metrics: metric ? {
        scope: metric.scope, currency: metric.currency, spend: cents(metric.spend), impressions: Math.round(metric.impressions),
        clicks: Math.round(metric.clicks), platformConversions: cents(metric.conversions),
        attributedOrders: attributed?.reliable ? attributed.orders : null,
        attributedRevenue: attributed?.reliable ? attributed.revenue : null,
        attributedCurrency: attributed?.reliable ? attributed.currency : null,
      } : null,
    };
  });
  for (const placement of placements) {
    const asset = assetById.get(placement.asset_id);
    if (!asset) continue;
    const campaign = campaignById.get(placement.ad_campaign_id ?? placement.campaign_key);
    const metric = metricFor(campaign, placement);
    const rows = assetGroups.get(placement.asset_id) ?? [];
    rows.push({
      id: placement.id, campaignId: placement.ad_campaign_id ?? placement.campaign_key,
      campaignName: campaign?.title || campaign?.product_name || placement.campaign_name_snapshot,
      platform: placement.platform, status: campaign?.status || placement.campaign_status_snapshot || "unknown",
      productId: campaign?.product_id || placement.product_id,
      productName: campaign?.product_name || placement.product_name_snapshot,
      variantLabel: placement.variant_label, isMultiMedia: placement.is_multi_media || (placementCounts.get(placement.campaign_key) ?? 0) > 1,
      metrics: metric,
    });
    assetGroups.set(placement.asset_id, rows);
  }
  const media = [...assetGroups.entries()].map(([assetId, campaignPlacements]) => {
    const asset = assetById.get(assetId)!;
    const measured = campaignPlacements.filter((placement) => placement.metrics.available);
    const currencies = [...new Set(measured.map((placement) => placement.metrics.currency).filter(Boolean))] as string[];
    const allAttributionsReliable = measured.length > 0 && measured.every((placement) => placement.metrics.attributionReliable);
    const spend = currencies.length === 1 && measured.length === campaignPlacements.length
      ? cents(measured.reduce((total, placement) => total + (placement.metrics.spend ?? 0), 0)) : null;
    const clicks = measured.length === campaignPlacements.length
      ? measured.reduce((total, placement) => total + (placement.metrics.clicks ?? 0), 0) : null;
    const orders = allAttributionsReliable
      ? measured.reduce((total, placement) => total + (placement.metrics.attributedOrders ?? 0), 0) : null;
    const revenueCurrencies = [...new Set(measured.map((placement) => placement.metrics.attributedCurrency).filter(Boolean))] as string[];
    const revenue = allAttributionsReliable && revenueCurrencies.length === 1
      ? cents(measured.reduce((total, placement) => total + (placement.metrics.attributedRevenue ?? 0), 0)) : null;
    const winners = campaignPlacements.some((placement) => placement.metrics.available && placement.metrics.attributionReliable && placement.metrics.attributedRevenue !== null && placement.metrics.spend !== null && placement.metrics.attributedCurrency === placement.metrics.currency && placement.metrics.attributedRevenue > placement.metrics.spend);
    return {
      id: asset.id, kind: asset.kind, url: asset.delivery_url, sha256: asset.sha256,
      exactMatchKey: asset.sha256, createdAt: asset.created_at,
      spend: currencies.length === 1 ? spend : null, currency: currencies.length === 1 ? currencies[0] : null,
      spendByCurrency: currencies.map((currency) => ({ currency, amount: cents(measured.filter((placement) => placement.metrics.currency === currency).reduce((total, placement) => total + (placement.metrics.spend ?? 0), 0)) })),
      clicks, attributedOrders: orders, attributedRevenue: revenue,
      attributedCurrency: revenueCurrencies.length === 1 ? revenueCurrencies[0] : null,
      costPerOrder: orders && orders > 0 && spend !== null ? cents(spend / orders) : null,
      winner: winners,
      metricsComplete: measured.length === campaignPlacements.length && measured.length > 0,
      campaigns: campaignPlacements,
    };
  });
  const duplicateCandidates = findQuasiDuplicates(assets.map((asset: any) => ({
    id: asset.id, sha256: asset.sha256, kind: asset.kind,
    perceptualHash: asset.perceptual_hash, keyframeHashes: asset.keyframe_hashes,
  })));
  const totalsByCurrency = new Map<string, { spend: number; clicks: number; orders: number; attributedRevenue: number; campaignCount: number; spendComplete: boolean; ordersKnown: boolean; revenueKnown: boolean }>();
  const launchedCampaigns = campaignSummaries.filter((campaign) => campaign.launched);
  let unavailableCampaignMetrics = 0;
  for (const campaign of launchedCampaigns) {
    const metric = campaign.metrics;
    if (!metric?.currency) { unavailableCampaignMetrics += 1; continue; }
    const row = totalsByCurrency.get(metric.currency) ?? {
      spend: 0, clicks: 0, orders: 0, attributedRevenue: 0, campaignCount: 0,
      spendComplete: true, ordersKnown: true, revenueKnown: true,
    };
    row.campaignCount += 1;
    row.spend += metric.spend;
    row.clicks += metric.clicks;
    if (metric.attributedOrders === null) row.ordersKnown = false;
    else row.orders += metric.attributedOrders;
    if (metric.attributedRevenue === null || metric.attributedCurrency !== metric.currency) row.revenueKnown = false;
    else row.attributedRevenue += metric.attributedRevenue;
    totalsByCurrency.set(metric.currency, row);
  }
  if (unavailableCampaignMetrics) for (const row of totalsByCurrency.values()) row.spendComplete = false;
  const totals = [...totalsByCurrency.entries()].map(([currency, row]) => ({
    currency, spend: cents(row.spend), clicks: row.clicks,
    attributedOrders: row.ordersKnown ? row.orders : null,
    costPerOrder: row.ordersKnown && row.orders > 0 ? cents(row.spend / row.orders) : null,
    attributedRevenue: row.revenueKnown ? cents(row.attributedRevenue) : null,
    campaigns: row.campaignCount, complete: row.spendComplete,
  }));
  return {
    period,
    metrics: { mediaCount: media.length, campaigns: campaignSummaries.length, launchedCampaigns: launchedCampaigns.length, unavailableCampaignMetrics, totals },
    media,
    campaigns: campaignSummaries,
    productEligibility: [...productEligibility.values()],
    duplicateCandidates,
    notices: {
      carousel: "Les résultats d’un carrousel restent au niveau de la publicité; ils ne sont pas répartis entre les images.",
      tikTok: campaigns.some((campaign) => campaign.platform === "tiktok")
        ? tiktokErrors.length ? "Les rapports TikTok Ads ne sont pas disponibles pour le moment."
          : !tiktokAccountIds.length ? "Connecte TikTok Ads pour consulter ses résultats." : null
        : null,
      pinterest: campaigns.some((campaign) => campaign.platform === "pinterest")
        ? pinterestErrors.length ? "Les rapports Pinterest Ads ne sont pas disponibles pour le moment."
          : !pinterestAccountIds.length ? "Connecte Pinterest Ads pour consulter ses résultats." : null
        : null,
      variant: "Une variante n’est affichée que si elle a été indiquée explicitement.",
    },
  };
}
