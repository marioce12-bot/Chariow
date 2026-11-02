import { decryptSecret } from "@/lib/crypto";
import { fetchMetaInsights, actionValue } from "./api";
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
  const errors: string[] = [];
  let campaignSpendMissing = false;
  let querySucceeded = false;
  let rowsRead = 0;
  let rowsWritten = 0;
  let insightsCalls = 0;
  try {
    const accessToken = decryptSecret(account.access_token_encrypted);
    for (const level of ["campaign", "adset", "ad"] as const) {
      insightsCalls += 1;
      try {
        // One account-wide paginated query per reporting level replaces the
        // repeated campaign-ID queries while preserving campaign/adset/ad views.
        const insights = await fetchMetaInsights(`act_${account.meta_account_id}`, accessToken, from, to, level);
        rowsRead += insights.length;
        if (level === "campaign") {
          querySucceeded = true;
          campaignSpendMissing = insights.some((insight: MetaInsight) => insight.spend === null || insight.spend === undefined || insight.spend === "");
        }
        const rows = insights.map((insight: MetaInsight) => buildRow(account, level, insight, from, to)).filter(Boolean);
        rowsWritten += rows.length;
        await upsertInsightRows(supabase, rows);
      } catch (error) {
        if (isMetaAuthenticationError(error)) throw error;
        errors.push(`${level}: ${errorText(error)}`);
      }
    }
  } catch (error) {
    if (isMetaAuthenticationError(error)) throw error;
    errors.push(`sync: ${errorText(error)}`);
  }
  if (campaignSpendMissing) errors.push("spend manquant dans les insights campagne");
  const summary = errors.length ? errors.join(" | ").slice(0, 1000) : null;
  const accountPatch: Record<string, unknown> = {
    last_synced_at: new Date().toISOString(),
    insights_sync_complete: errors.length === 0,
    last_sync_error: summary,
  };
  if (querySucceeded) {
    accountPatch.insights_sync_from = from;
    accountPatch.insights_sync_to = to;
  }
  const { error: accountUpdateError } = await supabase.from("meta_ad_accounts").update(accountPatch).eq("id", account.id);
  if (accountUpdateError) throw accountUpdateError;
  return { insightsCalls, rowsRead, rowsWritten, errors: errors.length };
}

export function resolveMetaInsightsWindow(
  account: { insights_sync_to?: string | null },
  now = new Date(),
  requested?: { from?: string | null; to?: string | null; resync?: boolean },
) {
  const to = now.toISOString().slice(0, 10);
  if (requested?.from && requested.to) return { from: requested.from, to: requested.to };
  const days = requested?.resync || !account.insights_sync_to ? 30 : 3;
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1))).toISOString().slice(0, 10);
  return { from, to };
}
