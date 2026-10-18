import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { calculateCampaignProfit, confidenceFromAttributions } from "@/lib/campaign-profit";
import { fetchAllPages } from "@/lib/paginated-query";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const params = new URL(request.url).searchParams;
  const storeId = params.get("storeId");
  const period = params.get("period") ?? "30";
  if (!storeId || !/^(7|30|90)$/.test(period)) return NextResponse.json({ error: "Boutique et période (7, 30 ou 90) requises" }, { status: 400 });
  const { data: store, error: storeError } = await supabase.from("stores").select("id,sales_last_synced_at,sales_last_sync_complete").eq("id", storeId).eq("user_id", user.id).single();
  if (storeError || !store) return NextResponse.json({ error: "Boutique introuvable" }, { status: 404 });

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  from.setUTCDate(from.getUTCDate() - Number(period) + 1);
  const since = from.toISOString().slice(0, 10);
  const until = now.toISOString().slice(0, 10);
  const fresh = (value: string | null) => !!value && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now.getTime() && now.getTime() - Date.parse(value) <= 48 * 3600000;
  const accountFields = "id,currency,last_synced_at,last_sync_error,insights_sync_from,insights_sync_to,insights_sync_complete";

  // Direct store ownership retains the legacy full-account behavior. A campaign link
  // only identifies an indirect account; it never grants access to its other campaigns.
  const [directResult, linksResult] = await Promise.all([
    supabase.from("meta_ad_accounts").select(accountFields).eq("user_id", user.id).eq("store_id", storeId).eq("is_active", true),
    fetchAllPages<any>(async (a, b) => await supabase.from("ad_campaigns").select("meta_ad_account_id,external_campaign_id").eq("user_id", user.id).eq("store_id", storeId).eq("platform", "meta").not("meta_ad_account_id", "is", null).order("id").range(a, b)),
  ]);
  if (directResult.error || linksResult.error) return NextResponse.json({ error: "Lecture des comptes Meta incomplète : aucun bénéfice fiable ne peut être affiché." }, { status: 503 });
  const directAccounts = directResult.data ?? [];
  const directIds = new Set(directAccounts.map(a => a.id));
  const linkedCampaignIds = new Map<string, Set<string>>();
  for (const link of linksResult.rows) {
    if (!link.meta_ad_account_id) continue;
    if (!linkedCampaignIds.has(link.meta_ad_account_id)) linkedCampaignIds.set(link.meta_ad_account_id, new Set());
    if (typeof link.external_campaign_id === "string" && link.external_campaign_id.trim()) linkedCampaignIds.get(link.meta_ad_account_id)!.add(link.external_campaign_id);
  }
  const indirectIds = [...linkedCampaignIds.keys()].filter(id => !directIds.has(id));
  let indirectAccounts: any[] = [];
  if (indirectIds.length) {
    const { data, error } = await supabase.from("meta_ad_accounts").select(accountFields).eq("user_id", user.id).eq("is_active", true).in("id", indirectIds);
    if (error) return NextResponse.json({ error: "Lecture des comptes Meta incomplète : aucun bénéfice fiable ne peut être affiché." }, { status: 503 });
    indirectAccounts = data ?? [];
  }
  const accounts = [...directAccounts, ...indirectAccounts];
  if (!accounts.length) return NextResponse.json({ campaigns: [], reasons: ["Compte publicitaire de cette boutique non identifié dans Vendeo; cela ne signifie pas que ton pixel est absent."] });
  const accountIds = accounts.map(a => a.id);
  const indirectAccountIds = new Set(indirectAccounts.map(a => a.id));
  const pages = await Promise.all([
    fetchAllPages<any>(async (a,b) => await supabase.from("meta_campaigns").select("id,ad_account_id,meta_campaign_id,name").in("ad_account_id", accountIds).order("id").range(a,b)),
    fetchAllPages<any>(async (a,b) => await supabase.from("meta_insights_daily").select("id,ad_account_id,entity_id,entity_name,date_start,date_stop,spend").in("ad_account_id", accountIds).eq("level","campaign").gte("date_start",since).lte("date_start",until).order("id").range(a,b)),
    fetchAllPages<any>(async (a,b) => await supabase.from("meta_campaign_mappings").select("id,meta_campaign_id,chariow_campaign_id,status,mapping_level").eq("user_id",user.id).eq("store_id",storeId).eq("status","active").eq("mapping_level","campaign").order("id").range(a,b)),
    fetchAllPages<any>(async (a,b) => await supabase.from("meta_attributions").select("id,chariow_sale_id,meta_campaign_id,attribution_method,attribution_confidence").eq("user_id",user.id).eq("store_id",storeId).order("id").range(a,b)),
    fetchAllPages<any>(async (a,b) => await supabase.from("chariow_sales").select("chariow_sale_id,product_id,chariow_campaign_id,chariow_campaign_name,amount,net_amount,currency,status,raw_payload,occurred_at").eq("store_id",storeId).gte("occurred_at",from.toISOString()).lte("occurred_at",now.toISOString()).order("chariow_sale_id").range(a,b)),
    fetchAllPages<any>(async (a,b) => await supabase.from("product_profit_costs").select("product_id,currency,unit_cost,fee_per_sale").eq("store_id",storeId).order("product_id").order("currency").range(a,b)),
  ]);
  if (pages.some(p => p.error)) return NextResponse.json({ error: "Lecture du rapprochement incomplète : aucun bénéfice complet ne peut être affiché." }, { status: 503 });
  let [campaigns, insights, mappings, attributions, sales, costs] = pages.map(p => p.rows);
  const inScope = (accountId: string, campaignId: string) => !indirectAccountIds.has(accountId) || linkedCampaignIds.get(accountId)?.has(campaignId) === true;
  // Enforce the per-store whitelist before campaign IDs can reach any calculation.
  campaigns = campaigns.filter(c => inScope(c.ad_account_id, c.meta_campaign_id));
  insights = insights.filter(i => inScope(i.ad_account_id, i.entity_id));
  // Keep all store-scoped attribution evidence for ambiguity checks. Removing an
  // unsynchronized competing mapping could falsely turn an ambiguous sale into a match.
  // Only the whitelisted campaign keys below may produce any returned result.
  const confidence = confidenceFromAttributions(attributions);
  const salesComplete = store.sales_last_sync_complete === true && fresh(store.sales_last_synced_at);
  const campaignKeys = new Map(campaigns.map(c => [`${c.ad_account_id}:${c.meta_campaign_id}`, c]));
  for (const insight of insights) if (!campaignKeys.has(`${insight.ad_account_id}:${insight.entity_id}`)) campaignKeys.set(`${insight.ad_account_id}:${insight.entity_id}`, { ad_account_id: insight.ad_account_id, meta_campaign_id: insight.entity_id, name: insight.entity_name || insight.entity_id });
  const results = [...campaignKeys.values()].flatMap(campaign => {
    const account = accounts.find(a => a.id === campaign.ad_account_id);
    if (!account || !inScope(account.id, campaign.meta_campaign_id)) return [];
    const ownMappings = mappings.filter(m => m.meta_campaign_id === campaign.meta_campaign_id);
    const nativeReliable = ownMappings.length === 1 && mappings.filter(m => m.chariow_campaign_id === ownMappings[0].chariow_campaign_id).length === 1;
    const trustedIds = new Set(attributions.filter(a => a.meta_campaign_id === campaign.meta_campaign_id && confidence.saleIds.has(a.chariow_sale_id)).map(a => a.chariow_sale_id));
    const linked = sales.filter(s => nativeReliable ? s.chariow_campaign_id === ownMappings[0].chariow_campaign_id : trustedIds.has(s.chariow_sale_id));
    const spendRows = insights.filter(i => i.ad_account_id === account.id && i.entity_id === campaign.meta_campaign_id);
    if (!spendRows.length && !linked.length) return [];
    const observedSpend = spendRows.length && spendRows.every(i => i.spend != null && Number.isFinite(Number(i.spend)) && i.date_stop === i.date_start) ? spendRows.reduce((n,i) => n + Number(i.spend),0) : null;
    const spendComplete = account.insights_sync_complete === true && fresh(account.last_synced_at) && !account.last_sync_error && !!account.insights_sync_from && account.insights_sync_from <= since && !!account.insights_sync_to && account.insights_sync_to >= until;
    return [calculateCampaignProfit({ id: campaign.meta_campaign_id, name: campaign.name || campaign.meta_campaign_id, currency: String(account.currency ?? "").toUpperCase(), spend: observedSpend, sales: linked, costs, mappingReliable: nativeReliable || trustedIds.size > 0, attributionReliable: nativeReliable || trustedIds.size > 0, spendComplete, salesComplete })];
  });
  return NextResponse.json({ campaigns: results, period: Number(period), reasons: results.length ? [] : ["Aucune campagne avec des dépenses ou ventes observées sur la période."] });
}
