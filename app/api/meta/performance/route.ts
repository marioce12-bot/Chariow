import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { convertCurrency } from "@/lib/currency";
import { isConfirmedChariowSaleStatus } from "@/lib/chariow/sales";
import { computeAutopilotDecision } from "@/lib/autopilot";
import type { MetaEntityPerformance } from "@/lib/meta/types";

type SaleRow = {
  chariow_sale_id: string;
  chariow_campaign_id?: string | null;
  status: string;
  amount: number | string | null;
  net_amount: number | string | null;
  currency: string | null;
  occurred_at?: string | null;
};

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sum(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce((total, row) => total + num(row[key]), 0);
}

async function fetchStoreSales(supabase: any, storeId: string, from: string, to: string): Promise<SaleRow[]> {
  const all: SaleRow[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 20_000; offset += pageSize) {
    const { data, error } = await supabase
      .from("chariow_sales")
      .select("chariow_sale_id,chariow_campaign_id,status,amount,net_amount,currency,occurred_at")
      .eq("store_id", storeId)
      .gte("occurred_at", `${from}T00:00:00.000Z`)
      .lte("occurred_at", `${to}T23:59:59.999Z`)
      .order("occurred_at", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as SaleRow[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

function decisionStatus(decision: string): MetaEntityPerformance["status"] {
  if (decision === "pause") return "loss";
  if (decision === "keep_running") return "profitable";
  return "warning";
}

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const accountId = params.get("account_id");
  const from = params.get("from") ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = params.get("to") ?? new Date().toISOString().slice(0, 10);
  const accountsQuery = supabase.from("meta_ad_accounts").select("id,meta_account_id,currency,last_synced_at,last_sync_error").eq("user_id", user.id).eq("is_active", true);
  const { data: account, error: accountError } = await (accountId ? accountsQuery.eq("id", accountId).maybeSingle() : accountsQuery.limit(1).maybeSingle());
  if (accountError) return NextResponse.json({ error: accountError.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Aucun compte Meta Ads connecté" }, { status: 404 });

  const adCurrency = String(account.currency || "").trim().toUpperCase();
  if (!adCurrency) return NextResponse.json({ error: "La devise du compte publicitaire n’est pas renseignée" }, { status: 409 });
  const { data: insightRows, error } = await supabase
    .from("meta_insights_daily")
    .select("level,entity_id,entity_name,impressions,clicks,spend,conversions,conversion_value")
    .eq("ad_account_id", account.id)
    .gte("date_start", from)
    .lte("date_start", to);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: store } = await supabase.from("stores").select("id").eq("user_id", user.id).eq("is_active", true).eq("platform", "chariow").limit(1).maybeSingle();
  let saleRows: SaleRow[] = [];
  if (store) {
    try {
      saleRows = await fetchStoreSales(supabase, store.id, from, to);
    } catch (storeError) {
      console.warn("Chariow sales unavailable", storeError instanceof Error ? storeError.message : storeError);
    }
  }

  const confirmedSales = saleRows.filter((sale) => isConfirmedChariowSaleStatus(sale.status));
  const storeRevenueMap = new Map<string, number>();
  for (const sale of confirmedSales) {
    const currency = String(sale.currency ?? "").trim().toUpperCase() || "INCONNUE";
    storeRevenueMap.set(currency, (storeRevenueMap.get(currency) ?? 0) + num(sale.net_amount));
  }
  const chariowRevenueByCurrency = [...storeRevenueMap.entries()].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }));
  const chariowRevenue = chariowRevenueByCurrency.length === 1 ? chariowRevenueByCurrency[0].amount : null;
  const chariowRevenueCurrency = chariowRevenueByCurrency.length === 1 ? chariowRevenueByCurrency[0].currency : null;

  const campaignInsightRows = ((insightRows ?? []) as Array<Record<string, unknown>>).filter((row) => row.level === "campaign");
  const campaignIds = [...new Set(campaignInsightRows.map((row) => String(row.entity_id ?? "")).filter(Boolean))];
  const campaignSummary = new Map<string, Record<string, unknown>>();
  for (const row of campaignInsightRows) {
    const id = String(row.entity_id ?? "");
    if (!id) continue;
    const current = campaignSummary.get(id) ?? { ...row, impressions: 0, clicks: 0, spend: 0, conversions: 0, conversion_value: 0 };
    for (const field of ["impressions", "clicks", "spend", "conversions", "conversion_value"]) current[field] = num(current[field]) + num(row[field]);
    campaignSummary.set(id, current);
  }
  const campaignSummaryRows = [...campaignSummary.values()];
  const { data: launchedCampaigns } = await supabase
    .from("ad_campaigns")
    .select("external_campaign_id,daily_budget,created_at,objective,effective_objective")
    .eq("user_id", user.id)
    .eq("meta_ad_account_id", account.id)
    .eq("platform", "meta")
    .in("external_campaign_id", campaignIds.length ? campaignIds : ["__none__"]);
  const launchedById = new Map((launchedCampaigns ?? []).map((row: { external_campaign_id: string; daily_budget: number | null; created_at: string; objective: string | null; effective_objective: string | null }) => [row.external_campaign_id, row]));

  const { data: pixelRows } = await supabase
    .from("meta_pixels")
    .select("pixel_id")
    .eq("user_id", user.id)
    .eq("ad_account_id", account.id)
    .eq("configured_on_chariow", true)
    .limit(1);
  const purchaseTrackingReady = Boolean(pixelRows?.length);

  const { data: directLinks } = store
    ? await supabase.from("meta_attributions").select("chariow_sale_id,meta_campaign_id").eq("user_id", user.id).eq("store_id", store.id).gte("attributed_at", `${from}T00:00:00.000Z`).lte("attributed_at", `${to}T23:59:59.999Z`).not("chariow_sale_id", "is", null).not("meta_campaign_id", "is", null)
    : { data: [] };
  const { data: mappings } = store
    ? await supabase.from("meta_campaign_mappings").select("meta_campaign_id,chariow_campaign_id,mapping_level").eq("user_id", user.id).eq("store_id", store.id).eq("status", "active")
    : { data: [] };

  const directSaleIdsByCampaign = new Map<string, Set<string>>();
  const directAttributedSaleIds = new Set<string>();
  for (const link of (directLinks ?? []) as Array<{ chariow_sale_id: string; meta_campaign_id: string }>) {
    directAttributedSaleIds.add(link.chariow_sale_id);
    const set = directSaleIdsByCampaign.get(link.meta_campaign_id) ?? new Set<string>();
    set.add(link.chariow_sale_id);
    directSaleIdsByCampaign.set(link.meta_campaign_id, set);
  }
  const mappingsByCampaign = new Map<string, Set<string>>();
  for (const mapping of (mappings ?? []) as Array<{ meta_campaign_id: string; chariow_campaign_id: string; mapping_level: string }>) {
    if (mapping.mapping_level !== "campaign" || !mapping.chariow_campaign_id) continue;
    const set = mappingsByCampaign.get(mapping.meta_campaign_id) ?? new Set<string>();
    set.add(mapping.chariow_campaign_id);
    mappingsByCampaign.set(mapping.meta_campaign_id, set);
  }
  const campaignsByNativeId = new Map<string, Set<string>>();
  for (const [metaId, nativeIds] of mappingsByCampaign) {
    for (const nativeId of nativeIds) {
      const set = campaignsByNativeId.get(nativeId) ?? new Set<string>();
      set.add(metaId);
      campaignsByNativeId.set(nativeId, set);
    }
  }

  const performances: Array<MetaEntityPerformance & {
    realSales: number | null;
    realGrossRevenue: number | null;
    realRevenue: number | null;
    realRoas: number | null;
    attributionReliable: boolean;
    trackingReady: boolean;
    dailyBudget: number | null;
    daysSinceLaunch: number | null;
    suggestedIncrease: number | null;
    decision: "keep_running" | "pause" | "learning" | "insufficient_data";
    decisionReasons: string[];
  }> = [];
  const assignedNativeSaleIds = new Set<string>();

  for (const row of campaignSummaryRows) {
    const id = String(row.entity_id ?? "");
    if (!id) continue;
    const spend = num(row.spend);
    const conversions = num(row.conversions);
    const conversionValue = num(row.conversion_value);
    const launched = launchedById.get(id);
    const directIds = directSaleIdsByCampaign.get(id) ?? new Set<string>();
    const nativeIds = mappingsByCampaign.get(id) ?? new Set<string>();
    const attributedRows = confirmedSales.filter((sale) => {
      if (directIds.has(sale.chariow_sale_id)) return true;
      return Boolean(!directAttributedSaleIds.has(sale.chariow_sale_id) && sale.chariow_campaign_id && nativeIds.has(sale.chariow_campaign_id) && campaignsByNativeId.get(sale.chariow_campaign_id)?.size === 1 && !assignedNativeSaleIds.has(sale.chariow_sale_id));
    });
    for (const sale of attributedRows) if (sale.chariow_campaign_id && nativeIds.has(sale.chariow_campaign_id)) assignedNativeSaleIds.add(sale.chariow_sale_id);

    const linked = directIds.size > 0 || nativeIds.size > 0;
    const trackingReady = launched?.objective === "sales" && launched.effective_objective === "sales" && purchaseTrackingReady;
    let convertedNet = 0;
    let convertedGross = 0;
    let currencyReliable = true;
    for (const sale of attributedRows) {
      const saleCurrency = sale.currency ?? "";
      const net = saleCurrency ? convertCurrency(num(sale.net_amount), saleCurrency, adCurrency) : null;
      const gross = saleCurrency ? convertCurrency(num(sale.amount), saleCurrency, adCurrency) : null;
      if (net === null || gross === null) {
        currencyReliable = false;
        continue;
      }
      convertedNet += net;
      convertedGross += gross;
    }
    const attributionReliable = linked && currencyReliable;
    const realSales = attributionReliable ? attributedRows.length : null;
    const realRevenue = attributionReliable ? Math.round(convertedNet * 100) / 100 : null;
    const realRoas = attributionReliable && spend > 0 ? convertedNet / spend : null;
    const daysSinceLaunch = launched?.created_at ? Math.max(0, (Date.now() - new Date(launched.created_at).getTime()) / 86400000) : null;
    const dailyBudget = launched?.daily_budget == null ? null : num(launched.daily_budget);
    const decisionInputReady = attributionReliable && trackingReady && dailyBudget !== null && daysSinceLaunch !== null;
    const decision = computeAutopilotDecision({
      spend,
      netRevenue: decisionInputReady ? convertedNet : 0,
      grossRevenue: decisionInputReady ? convertedGross : 0,
      completedSales: decisionInputReady ? attributedRows.length : 0,
      dailyBudget: dailyBudget ?? 0,
      daysSinceLaunch: daysSinceLaunch ?? 0,
      attributionReliable: decisionInputReady,
    });
    const suggestedIncrease = decision.decision === "keep_running" && dailyBudget !== null
      ? Math.round(Math.max(0, dailyBudget * 0.2) * 2) / 2
      : null;
    performances.push({
      id,
      name: String(row.entity_name ?? id),
      level: "campaign",
      impressions: num(row.impressions),
      clicks: num(row.clicks),
      spend,
      conversions,
      conversionValue,
      revenue: conversionValue,
      cac: realSales && realSales > 0 ? spend / realSales : null,
      cpa: conversions > 0 ? spend / conversions : null,
      roas: spend > 0 ? conversionValue / spend : null,
      realSales,
      realGrossRevenue: attributionReliable ? Math.round(convertedGross * 100) / 100 : null,
      realRevenue,
      realRoas,
      attributionReliable,
      trackingReady,
      dailyBudget,
      daysSinceLaunch,
      suggestedIncrease,
      decision: decision.decision,
      decisionReasons: decision.reasons,
      status: decisionStatus(decision.decision),
    });
  }

  // Les niveaux ad/adset sont des découpages imbriqués : seul le niveau campaign
  // alimente les dépenses globales et les ROAS, jamais leur somme.
  const totalSpend = sum(campaignInsightRows, "spend");
  const totalConversions = sum(campaignInsightRows, "conversions");
  const metaReportedRevenue = sum(campaignInsightRows, "conversion_value");
  const reliableCampaigns = performances.filter((campaign) => campaign.attributionReliable && campaign.realRevenue !== null);
  const attributedNetRevenue = reliableCampaigns.reduce((total, campaign) => total + (campaign.realRevenue ?? 0), 0);
  const attributedGrossRevenue = reliableCampaigns.reduce((total, campaign) => total + (campaign.realGrossRevenue ?? 0), 0);
  const attributedSalesCount = reliableCampaigns.reduce((total, campaign) => total + (campaign.realSales ?? 0), 0);
  const attributedSpend = reliableCampaigns.reduce((total, campaign) => total + campaign.spend, 0);
  const totalSpendUsd = convertCurrency(attributedSpend, adCurrency, "USD");
  const attributedRevenueUsd = convertCurrency(attributedNetRevenue, adCurrency, "USD");
  const realRoas = reliableCampaigns.length > 0 && totalSpendUsd !== null && attributedRevenueUsd !== null && totalSpendUsd > 0 ? attributedRevenueUsd / totalSpendUsd : null;

  return NextResponse.json({
    currency: adCurrency,
    adCurrency,
    storeRevenueCurrency: chariowRevenueCurrency,
    chariowRevenueByCurrency,
    lastSyncedAt: account.last_synced_at ?? null,
    lastSyncError: account.last_sync_error ?? null,
    period: { from, to },
    overview: {
      spend: totalSpend,
      chariowRevenue,
      metaReportedRevenue,
      attributedGrossRevenue: reliableCampaigns.length ? attributedGrossRevenue : null,
      attributedNetRevenue: reliableCampaigns.length ? attributedNetRevenue : null,
      attributedRevenue: reliableCampaigns.length ? attributedNetRevenue : null,
      conversions: totalConversions,
      sales: confirmedSales.length,
      cpa: totalConversions > 0 ? totalSpend / totalConversions : null,
      cac: attributedSalesCount > 0 ? attributedSpend / attributedSalesCount : null,
      metaRoas: totalSpend > 0 ? metaReportedRevenue / totalSpend : null,
      realRoas,
      attributionCoverage: attributedSalesCount,
      salesCurrencies: chariowRevenueByCurrency.map((item) => item.currency),
    },
    performances,
  });
}
