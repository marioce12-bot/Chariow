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

export async function fetchMetaResources(accountId: string, accessToken: string) {
  const account = graphUrl(accountId, { fields: "id,name,account_status,currency,business", access_token: accessToken });
  const pages = graphUrl("me/accounts", { fields: "id,name,access_token,instagram_business_account", limit: "100", access_token: accessToken });
  const pixels = graphUrl(`${accountId}/adspixels`, { fields: "id,name", limit: "100", access_token: accessToken });
  const [accountResponse, pagesResponse, pixelsResponse] = await Promise.all([fetch(account, { cache: "no-store" }), fetch(pages, { cache: "no-store" }), fetch(pixels, { cache: "no-store" })]);
  const [accountJson, pagesJson, pixelsJson] = await Promise.all([accountResponse.json().catch(() => ({})), pagesResponse.json().catch(() => ({})), pixelsResponse.json().catch(() => ({}))]);
  if (!accountResponse.ok) throw new Error(typeof accountJson?.error?.message === "string" ? accountJson.error.message : "Impossible de lire le compte Meta");
  return { account: accountJson, pages: Array.isArray(pagesJson?.data) ? pagesJson.data : [], pixels: Array.isArray(pixelsJson?.data) ? pixelsJson.data : [] };
}

export async function fetchMetaPageAccessToken(pageId: string, accessToken: string) {
  const response = await fetch(graphUrl(pageId, { fields: "id,access_token", access_token: accessToken }), { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || typeof json.access_token !== "string") throw new Error(typeof json?.error?.message === "string" ? json.error.message : "Impossible d’accéder à la page Facebook sélectionnée");
  return json.access_token;
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

export async function getMetaAccountFunding(accountId: string, accessToken: string) {
  const response = await fetch(graphUrl(accountId, { fields: "account_status,disable_reason,balance,amount_spent,spend_cap,currency,is_prepay_account,funding_source_details", access_token: accessToken }), { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof json?.error?.message === "string" ? json.error.message : "Impossible de vérifier le compte Meta");
  return {
    accountStatus: Number(json.account_status ?? 0),
    hasFundingSource: json.funding_source_details != null,
    balance: json.balance != null ? Number(json.balance) : null,
    currency: typeof json.currency === "string" ? json.currency : null,
    isPrepayAccount: Boolean(json.is_prepay_account),
  };
}

/**
 * Distingue les cas bloquants avant de lancer une campagne.
 * Retourne null si rien ne bloque, sinon un message clair pour le tableau de bord.
 * Volontairement prudent sur `balance`/`spend_cap` : leur sens exact diffère selon
 * que le compte est prépayé ou facturé après coup (postpay). On ne bloque donc que sur
 * les deux signaux fiables à 100% : compte non actif, et aucun moyen de paiement du tout.
 */
export function describeMetaFundingIssue(funding: { accountStatus: number; hasFundingSource: boolean }): { code: string; message: string } | null {
  if (funding.accountStatus !== 1) {
    return { code: "META_ACCOUNT_RESTRICTED", message: "Ce compte publicitaire Meta n'est pas actif (compte restreint, en revue ou désactivé). Vérifie son état dans Meta Account Quality avant de relancer." };
  }
  if (!funding.hasFundingSource) {
    return { code: "META_NO_PAYMENT_METHOD", message: "Aucun moyen de paiement n'est configuré sur ce compte Meta Ads. Ajoute une carte dans Meta Business Manager (Facturation) avant de lancer une campagne." };
  }
  return null;
}
