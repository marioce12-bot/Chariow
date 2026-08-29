import type { MetaInsight } from "./types";

export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";
export const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

function graphUrl(path: string, params: Record<string, string>) {
  const url = new URL(`${META_GRAPH_BASE_URL}/${path}`);
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
  // Do not request campaign_id/campaign_name: some Meta account tokens reject
  // these fields even when the insight level is campaign (#100). The API
  // returns the level identity when available; the sync layer can fallback to
  // the entity id or the requested range when it is omitted.
  const identityFields = level === "campaign"
    ? []
    : level === "adset"
      ? ["adset_id", "adset_name"]
      : ["ad_id", "ad_name"];
  const fields = [...identityFields, "impressions", "reach", "clicks", "spend", "ctr", "cpc", "cpm", "actions", "action_values", "purchase_roas"].join(",");
  console.info("Meta insights request", { level, fields, from, to });
  const url = graphUrl(`${accountId}/insights`, { fields, level, time_range: JSON.stringify({ since: from, until: to }), time_increment: "1", limit: "500", access_token: accessToken });
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
