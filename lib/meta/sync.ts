import { decryptSecret } from "@/lib/crypto";
import { fetchMetaCampaignList } from "./campaign-list";
import { actionValue, fetchMetaInsights, MetaCampaignIdentityUnsupportedError } from "./api";
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
type CampaignTarget = { id: string; name: string | null };
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

async function getCampaignTargets(supabase: any, account: { id: string; meta_account_id: string }, accessToken: string) {
  const targets = new Map<string, string | null>();
  for (const campaign of await fetchMetaCampaignList(`act_${account.meta_account_id}`, accessToken)) {
    targets.set(campaign.id, campaign.name);
  }
  const { data: localCampaigns, error } = await supabase.from("ad_campaigns")
    .select("external_campaign_id,title,product_name")
    .eq("meta_ad_account_id", account.id)
    .eq("platform", "meta")
    .not("external_campaign_id", "is", null)
    .limit(200);
  if (error) throw error;
  if ((localCampaigns ?? []).length >= 200) throw new Error("liste des campagnes locales limitée à 200; fallback incomplet");
  for (const campaign of (localCampaigns ?? []) as Array<{ external_campaign_id: string; title: string | null; product_name: string | null }>) {
    targets.set(campaign.external_campaign_id, campaign.title || campaign.product_name || targets.get(campaign.external_campaign_id) || null);
  }
  return [...targets].map(([id, name]) => ({ id, name }));
}

async function syncCampaignsById(
  supabase: any,
  account: { id: string },
  accessToken: string,
  from: string,
  to: string,
  targets: CampaignTarget[],
) {
  const insights: Array<{ target: CampaignTarget; rows: MetaInsight[] }> = [];
  const errors: string[] = [];
  let nextIndex = 0;
  let campaignSpendMissing = false;
  const worker = async () => {
    while (nextIndex < targets.length) {
      const target = targets[nextIndex++];
      try {
        const rows = await fetchMetaInsights(target.id, accessToken, from, to, "campaign", { includeCampaignIdentity: false });
        if (rows.some((row) => row.spend === null || row.spend === undefined || row.spend === "")) campaignSpendMissing = true;
        insights.push({ target, rows });
      } catch (error) {
        if (isMetaAuthenticationError(error)) throw error;
        errors.push(`${target.id}: ${errorText(error)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_CAMPAIGN_REQUESTS, targets.length) }, worker));

  const rowsRead = insights.reduce((total, item) => total + item.rows.length, 0);
  const rows = insights.flatMap(({ target, rows: campaignRows }) =>
    campaignRows.map((row) => buildRow(account, "campaign", row, from, to, target)).filter((row) => row !== null),
  );
  for (let index = 0; index < rows.length; index += 500) {
    await upsertInsightRows(supabase, rows.slice(index, index + 500));
  }
  return { rowsRead, rowsWritten: rows.length, errors, campaignSpendMissing };
}

export async function syncMetaInsights(supabase: any, account: { id: string; meta_account_id: string; access_token_encrypted: string }, from: string, to: string) {
  const errors: string[] = [];
  let campaignSpendMissing = false;
  let querySucceeded = false;
  let rowsRead = 0;
  let rowsWritten = 0;
  let insightsCalls = 0;
  let campaignFallbackRequests = 0;
  let campaignFallbackRequired: "unsupported_identity" | "missing_identity" | null = null;
  try {
    const accessToken = decryptSecret(account.access_token_encrypted);
    for (const level of ["campaign", "adset", "ad"] as const) {
      insightsCalls += 1;
      try {
        // Normal path: one account-wide paginated request per reporting level.
        // Request campaign identity so its rows remain addressable for upsert.
        const insights = await fetchMetaInsights(`act_${account.meta_account_id}`, accessToken, from, to, level);
        rowsRead += insights.length;
        const rows = insights.map((insight: MetaInsight) => buildRow(account, level, insight, from, to)).filter((row) => row !== null);
        if (level === "campaign" && insights.length > 0 && rows.length !== insights.length) {
          // Some tokens omit identity despite a successful response: never silently lose those rows.
          campaignFallbackRequired = "missing_identity";
          continue;
        }
        if (level === "campaign") {
          querySucceeded = true;
          campaignSpendMissing = insights.some((insight: MetaInsight) => insight.spend === null || insight.spend === undefined || insight.spend === "");
        }
        rowsWritten += rows.length;
        await upsertInsightRows(supabase, rows);
      } catch (error) {
        if (isMetaAuthenticationError(error)) throw error;
        if (level === "campaign" && error instanceof MetaCampaignIdentityUnsupportedError) {
          campaignFallbackRequired = "unsupported_identity";
          continue;
        }
        errors.push(`${level}: ${errorText(error)}`);
      }
    }

    if (campaignFallbackRequired) {
      const targets = await getCampaignTargets(supabase, account, accessToken);
      if (targets.length === 0) {
        errors.push("identifiants de campagnes indisponibles pour le fallback Meta");
      } else {
        campaignFallbackRequests = targets.length;
        insightsCalls += targets.length;
        const fallback = await syncCampaignsById(supabase, account, accessToken, from, to, targets);
        rowsRead += fallback.rowsRead;
        rowsWritten += fallback.rowsWritten;
        errors.push(...fallback.errors);
        campaignSpendMissing ||= fallback.campaignSpendMissing;
        if (campaignFallbackRequired === "missing_identity" && fallback.rowsWritten === 0) {
          errors.push("les lignes Insights campagne ne contenaient aucun identifiant exploitable");
        }
        if (fallback.errors.length === 0) querySucceeded = true;
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
  return { insightsCalls, rowsRead, rowsWritten, errors: errors.length, campaignFallbackRequests };
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
