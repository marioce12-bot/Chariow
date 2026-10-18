import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { currencyFractionDigits, validateBudgetLimit } from "@/lib/autopilot-budget";

// Rapports du pilotage automatique pour l'utilisateur courant, du plus récent
// au plus ancien. Chaque rapport relie la dépense pub aux ventes réelles et à la
// décision prise (laisser tourner / mettre en pause / en apprentissage).
export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const { data: reports, error } = await supabase
    .from("ad_campaign_autopilot_reports")
    .select("id,campaign_id,platform,period_from,period_to,spend,gross_revenue,net_revenue,completed_sales,impressions,clicks,roas,cac,decision,reasons,metrics,currency,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: "Impossible de charger les rapports de pilotage" }, { status: 500 });

  const { data: campaigns, error: campaignsError } = await supabase.from("ad_campaigns")
    .select("id,title,product_name,platform,autopilot_enabled,autopilot_budget_limit,autopilot_budget_limit_currency,meta_ad_account_id,tiktok_ad_account_id")
    .eq("user_id", user.id).in("platform", ["meta", "tiktok"])
    .order("created_at", { ascending: false }).limit(100);
  if (campaignsError) return NextResponse.json({ error: "Impossible de charger les campagnes de pilotage" }, { status: 500 });
  const metaIds = [...new Set((campaigns ?? []).filter((c: any) => c.platform === "meta").map((c: any) => c.meta_ad_account_id).filter(Boolean))];
  const tiktokIds = [...new Set((campaigns ?? []).filter((c: any) => c.platform === "tiktok").map((c: any) => c.tiktok_ad_account_id).filter(Boolean))];
  const [metaResult, tiktokResult] = await Promise.all([
    metaIds.length ? supabase.from("meta_ad_accounts").select("id,currency").eq("user_id", user.id).in("id", metaIds).limit(100) : Promise.resolve({ data: [], error: null }),
    tiktokIds.length ? supabase.from("tiktok_ad_accounts").select("id,currency").eq("user_id", user.id).in("id", tiktokIds).limit(100) : Promise.resolve({ data: [], error: null }),
  ]);
  if (metaResult.error || tiktokResult.error) return NextResponse.json({ error: "Impossible de vérifier les devises des campagnes" }, { status: 500 });
  const currencies = new Map<string, string>([
    ...(metaResult.data ?? []).map((a: any) => [`meta:${a.id}`, a.currency] as [string, string]),
    ...(tiktokResult.data ?? []).map((a: any) => [`tiktok:${a.id}`, a.currency] as [string, string]),
  ]);
  const caps = new Map<string, { budget_limit: number | null; currency: string | null }>();
  for (const campaign of campaigns ?? []) {
    const accountId = campaign.platform === "meta" ? campaign.meta_ad_account_id : campaign.tiktok_ad_account_id;
    const rawCurrency = currencies.get(`${campaign.platform}:${accountId}`);
    const currency = typeof rawCurrency === "string" && currencyFractionDigits(rawCurrency.trim()) !== null ? rawCurrency.trim().toUpperCase() : null;
    const amount = campaign.autopilot_budget_limit == null ? null : Number(campaign.autopilot_budget_limit);
    const matching = currency && campaign.autopilot_budget_limit_currency?.toUpperCase() === currency;
    caps.set(campaign.id, { budget_limit: matching && amount !== null && validateBudgetLimit(amount, currency) ? amount : null, currency });
  }
  const titles = new Map((campaigns ?? []).map((campaign: any) => [campaign.id, campaign.title || campaign.product_name || "Campagne"]));
  const listedCampaigns = (campaigns ?? []).map((campaign: any) => ({ id: campaign.id, title: campaign.title || campaign.product_name || "Campagne", platform: campaign.platform, autopilot_enabled: Boolean(campaign.autopilot_enabled), ...(caps.get(campaign.id) ?? { budget_limit: null, currency: null }) }));
  const enriched = (reports ?? []).map((report: Record<string, unknown>) => ({
    ...report,
    recommendation: (report.metrics as Record<string, unknown> | null)?.recommendation ?? null,
    recommendation_reason: (report.metrics as Record<string, unknown> | null)?.recommendation_reason ?? null,
    cpa_threshold: (report.metrics as Record<string, unknown> | null)?.cpa_threshold ?? null,
    mutation_block_reason: (report.metrics as Record<string, unknown> | null)?.mutation_block_reason ?? null,
    campaign_title: titles.get(String(report.campaign_id)) ?? "Campagne",
    budget_limit: caps.get(String(report.campaign_id))?.budget_limit ?? null,
    budget_limit_currency: caps.get(String(report.campaign_id))?.currency ?? null,
    budget_block_reason: caps.get(String(report.campaign_id))?.budget_limit == null ? "NO_BUDGET_LIMIT" : null,
  }));
  return NextResponse.json({ reports: enriched, campaigns: listedCampaigns });
}
