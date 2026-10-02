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

type Level = "campaign" | "adset" | "ad";

function buildRow(
  account: { id: string },
  level: Level,
  insight: MetaInsight,
  from: string,
  to: string,
  forced?: { id: string; name?: string | null },
) {
  const id = forced?.id ?? (level === "campaign" ? insight.campaign_id ?? insight.id : level === "adset" ? insight.adset_id ?? insight.id : insight.ad_id ?? insight.id);
  const name = forced?.name ?? (level === "campaign" ? insight.campaign_name : level === "adset" ? insight.adset_name : insight.ad_name);
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
    conversions: actionValue(insight.actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]),
    conversion_value: actionValue(insight.action_values, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]),
    raw: insight,
  };
}

export async function syncMetaInsights(supabase: any, account: { id: string; meta_account_id: string; access_token_encrypted: string }, from: string, to: string) {
  const accessToken = decryptSecret(account.access_token_encrypted);
  const results: Array<{ level: Level | "campaign_by_id"; count: number; error?: string }> = [];

  for (const level of ["campaign", "adset", "ad"] as const) {
    const insights = await fetchMetaInsights(`act_${account.meta_account_id}`, accessToken, from, to, level);
    const rows = insights.map((insight: MetaInsight) => buildRow(account, level, insight, from, to)).filter(Boolean);
    if (rows.length) await supabase.from("meta_insights_daily").upsert(rows, { onConflict: "ad_account_id,level,entity_id,date_start" });
    results.push({ level, count: rows.length });
  }

  // Le niveau "campaign" n'est pas fiable au niveau du compte : on ne demande pas
  // campaign_id (erreur #100 sur certains tokens), donc Meta peut renvoyer des
  // lignes sans identifiant, qui seraient alors ignorées. On interroge donc
  // chaque campagne lancée depuis la plateforme directement par son ID
  // (/{campaign_id}/insights) : l'identifiant est alors connu avec certitude et
  // l'autopilote dispose toujours de la dépense réelle.
  const { data: launched } = await supabase
    .from("ad_campaigns")
    .select("external_campaign_id,title,product_name")
    .eq("meta_ad_account_id", account.id)
    .eq("platform", "meta")
    .not("external_campaign_id", "is", null)
    .limit(200);

  let byIdCount = 0;
  const errors: string[] = [];
  for (const campaign of (launched ?? []) as Array<{ external_campaign_id: string; title: string | null; product_name: string | null }>) {
    try {
      const insights = await fetchMetaInsights(campaign.external_campaign_id, accessToken, from, to, "campaign");
      const rows = insights
        .map((insight: MetaInsight) => buildRow(account, "campaign", insight, from, to, { id: campaign.external_campaign_id, name: campaign.title || campaign.product_name }))
        .filter(Boolean);
      if (rows.length) await supabase.from("meta_insights_daily").upsert(rows, { onConflict: "ad_account_id,level,entity_id,date_start" });
      byIdCount += rows.length;
    } catch (error) {
      errors.push(`${campaign.external_campaign_id}: ${error instanceof Error ? error.message.slice(0, 200) : "erreur"}`);
    }
  }
  results.push({ level: "campaign_by_id", count: byIdCount, ...(errors.length ? { error: errors.join(" | ") } : {}) });

  await supabase.from("meta_ad_accounts").update({ last_synced_at: new Date().toISOString() }).eq("id", account.id);
  return results;
}
