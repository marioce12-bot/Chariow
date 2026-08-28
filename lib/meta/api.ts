import type { MetaInsight } from "./types";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";

function graphUrl(path: string, params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

export async function fetchMetaAccounts(accessToken: string) {
  const response = await fetch(graphUrl("me/adaccounts", { fields: "id,name,currency,account_status", limit: "100", access_token: accessToken }), { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof json?.error?.message === "string" ? json.error.message : `Meta accounts request failed (${response.status})`);
  return Array.isArray(json.data) ? json.data as Array<Record<string, unknown>> : [];
}

export async function fetchMetaInsights(accountId: string, accessToken: string, from: string, to: string, level: "campaign" | "adset" | "ad") {
  const fields = ["date_start", "date_stop", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name", "impressions", "reach", "clicks", "spend", "ctr", "cpc", "cpm", "actions", "action_values", "purchase_roas"].join(",");
  const url = graphUrl(accountId, { fields, level, time_range: JSON.stringify({ since: from, until: to }), time_increment: "1", limit: "500", access_token: accessToken });
  const rows: MetaInsight[] = [];
  let next: string | null = url.toString();
  while (next) {
    const response: Response = await fetch(next, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof json?.error?.message === "string" ? json.error.message : `Meta insights request failed (${response.status})`);
    if (Array.isArray(json.data)) rows.push(...json.data as MetaInsight[]);
    next = typeof json?.paging?.next === "string" ? json.paging.next : null;
  }
  return rows;
}

export function actionValue(actions: unknown, types: string[]) {
  if (!Array.isArray(actions)) return 0;
  return actions.reduce((total, action) => {
    if (!action || typeof action !== "object") return total;
    const row = action as { action_type?: unknown; value?: unknown };
    return types.includes(String(row.action_type)) ? total + Number(row.value ?? 0) : total;
  }, 0);
}
