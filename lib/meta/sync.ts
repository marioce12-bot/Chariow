import { decryptSecret } from "@/lib/crypto";
import { fetchMetaInsights, actionValue } from "./api";
import type { MetaInsight } from "./types";

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown, fallback: string) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export async function syncMetaInsights(supabase: any, account: { id: string; meta_account_id: string; access_token_encrypted: string }, from: string, to: string) {
  const accessToken = decryptSecret(account.access_token_encrypted);
  const results = [];
  for (const level of ["campaign", "adset", "ad"] as const) {
    const insights = await fetchMetaInsights(`act_${account.meta_account_id}`, accessToken, from, to, level);
    const rows = insights.map((insight: MetaInsight) => {
      const id = level === "campaign" ? insight.campaign_id : level === "adset" ? insight.adset_id : insight.ad_id;
      const name = level === "campaign" ? insight.campaign_name : level === "adset" ? insight.adset_name : insight.ad_name;
      const conversions = actionValue(insight.actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]);
      const conversionValue = actionValue(insight.action_values, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]);
      if (!id) return null;
      return {
        ad_account_id: account.id,
        level,
        entity_id: id,
        entity_name: name ?? id,
        date_start: dateValue(insight.date_start, from),
        date_stop: dateValue(insight.date_stop, to),
        impressions: Math.round(number(insight.impressions)),
        reach: Math.round(number(insight.reach)),
        clicks: Math.round(number(insight.clicks)),
        spend: number(insight.spend),
        ctr: number(insight.ctr),
        cpc: number(insight.cpc),
        cpm: number(insight.cpm),
        conversions,
        conversion_value: conversionValue,
        raw: insight,
      };
    }).filter(Boolean);
    if (rows.length) await supabase.from("meta_insights_daily").upsert(rows, { onConflict: "ad_account_id,level,entity_id,date_start" });
    results.push({ level, count: rows.length });
  }
  await supabase.from("meta_ad_accounts").update({ last_synced_at: new Date().toISOString() }).eq("id", account.id);
  return results;
}
