import { decryptSecret } from "@/lib/crypto";
import { fetchMetaInsights, actionValue } from "./api";
import { fetchMetaCampaignList } from "./campaign-list";
import type { MetaInsight } from "./types";
import { isMetaAuthenticationError } from "./graph";

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function dateValue(value: unknown, fallback: string) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}
type Level = "campaign" | "adset" | "ad";
const MAX_CONCURRENT_CAMPAIGN_REQUESTS = 5;
async function upsertInsightRows<T extends object>(supabase: any, rows: Array<T | null>) {
  const safeRows = rows.filter((row): row is T => row !== null);
  if (!safeRows.length) return;
  const { error } = await supabase.from("meta_insights_daily").upsert(safeRows, { onConflict: "ad_account_id,level,entity_id,date_start" });
  if (error) throw error;
}
function buildRow(account: { id: string }, level: Level, insight: MetaInsight, from: string, to: string, forced?: { id: string; name?: string | null }) {
  const id = forced?.id ?? (level === "campaign" ? insight.campaign_id ?? insight.id : level === "adset" ? insight.adset_id ?? insight.id : insight.ad_id ?? insight.id);
  const name = forced?.name ?? (level === "campaign" ? insight.campaign_name : level === "adset" ? insight.adset_name : insight.ad_name);
  if (!id) return null;
  return {
    ad_account_id: account.id, level, entity_id: id, entity_name: name ?? id,
    date_start: dateValue(insight.date_start, from), date_stop: dateValue(insight.date_stop, to),
    impressions: Math.round(number(insight.impressions)), reach: Math.round(number(insight.reach)),
    clicks: Math.round(number(insight.clicks)),
    spend: level === "campaign" && (insight.spend === null || insight.spend === undefined || insight.spend === "") ? null : number(insight.spend),
    ctr: number(insight.ctr), cpc: number(insight.cpc), cpm: number(insight.cpm),
    conversions: actionValue(insight.actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]),
    conversion_value: actionValue(insight.action_values, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]),
    raw: insight,
  };
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 200) : "erreur";
}

export async function syncMetaInsights(supabase: any, account: { id: string; meta_account_id: string; access_token_encrypted: string }, from: string, to: string) {
  const results: Array<{ level: Level | "campaign_by_id"; count: number; error?: string }> = [];
  const errors: string[] = [];
  let campaignSpendMissing = false;
  try {
    const accessToken = decryptSecret(account.access_token_encrypted);
    for (const level of ["campaign", "adset", "ad"] as const) {
      try {
        const insights = await fetchMetaInsights(`act_${account.meta_account_id}`, accessToken, from, to, level);
        if (level === "campaign" && insights.some((insight: MetaInsight) => insight.spend === null || insight.spend === undefined || insight.spend === "")) campaignSpendMissing = true;
        const rows = insights.map((insight: MetaInsight) => buildRow(account, level, insight, from, to)).filter(Boolean);
        await upsertInsightRows(supabase, rows);
        results.push({ level, count: rows.length });
      } catch (error) {
        if (isMetaAuthenticationError(error)) throw error;
        errors.push(`${level}: ${errorText(error)}`);
        results.push({ level, count: 0, error: errorText(error) });
      }
    }

    const targets = new Map<string, string | null>();
    try {
      for (const campaign of await fetchMetaCampaignList(`act_${account.meta_account_id}`, accessToken)) targets.set(campaign.id, campaign.name);
    } catch (error) {
      if (isMetaAuthenticationError(error)) throw error;
      errors.push(`liste des campagnes: ${errorText(error)}`);
    }

    try {
      const { data: launched, error: launchedError } = await supabase.from("ad_campaigns")
        .select("external_campaign_id,title,product_name").eq("meta_ad_account_id", account.id)
        .eq("platform", "meta").not("external_campaign_id", "is", null).limit(200);
      if (launchedError) throw launchedError;
      if ((launched ?? []).length >= 200) errors.push("liste des campagnes locales limitée à 200; couverture incomplète");
      for (const campaign of (launched ?? []) as Array<{ external_campaign_id: string; title: string | null; product_name: string | null }>) {
        targets.set(campaign.external_campaign_id, campaign.title || campaign.product_name || targets.get(campaign.external_campaign_id) || null);
      }
    } catch (error) { errors.push(`campagnes Vendeo: ${errorText(error)}`); }

    const entries = [...targets.entries()];
    let byIdCount = 0;
    let nextIndex = 0;
    let campaignByIdRequests = 0;
    try {
      await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_CAMPAIGN_REQUESTS, entries.length) }, async () => {
        while (nextIndex < entries.length) {
          const [campaignId, campaignName] = entries[nextIndex++];
          campaignByIdRequests += 1;
          try {
            const insights = await fetchMetaInsights(campaignId, accessToken, from, to, "campaign");
            if (insights.some((insight: MetaInsight) => insight.spend === null || insight.spend === undefined || insight.spend === "")) campaignSpendMissing = true;
            const rows = insights.map((insight: MetaInsight) => buildRow(account, "campaign", insight, from, to, { id: campaignId, name: campaignName })).filter(Boolean);
            await upsertInsightRows(supabase, rows);
            byIdCount += rows.length;
          } catch (error) {
            if (isMetaAuthenticationError(error)) throw error;
            errors.push(`${campaignId}: ${errorText(error)}`);
          }
        }
      }));
    } finally {
      console.info("Meta campaign ID counters", { campaignByIdRequests });
    }
    results.push({ level: "campaign_by_id", count: byIdCount, ...(errors.length ? { error: errors.join(" | ") } : {}) });
  } catch (error) {
    if (isMetaAuthenticationError(error)) throw error;
    errors.push(`sync: ${errorText(error)}`);
  }
  if (campaignSpendMissing) errors.push("spend manquant dans les insights campagne");
  const summary = errors.length ? errors.join(" | ").slice(0, 1000) : null;
  const { error: accountUpdateError } = await supabase.from("meta_ad_accounts").update({
    last_synced_at: new Date().toISOString(),
    insights_sync_from: from,
    insights_sync_to: to,
    insights_sync_complete: errors.length === 0,
    last_sync_error: summary,
  }).eq("id", account.id);
  if (accountUpdateError) throw accountUpdateError;
  return results;
}
