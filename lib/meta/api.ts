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

export async function fetchMetaAccountStatus(accountId: string, accessToken: string): Promise<number> {
  const response = await fetch(graphUrl(accountId, { fields: "account_status", access_token: accessToken }), { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof json?.error?.message === "string" ? json.error.message : `Meta account status request failed (${response.status})`);
  const status = Number(json.account_status);
  if (!Number.isInteger(status) || status <= 0) throw new Error("Meta n’a pas renvoyé un account_status valide");
  return status;
}

/**
 * Récupère compte, pages et pixels en parallèle, mais SANS laisser l'échec
 * d'un seul de ces trois appels faire échouer les autres : on a vu en
 * production un cas ("API access blocked.") où l'appel sur le nœud du compte
 * (demandant le champ sensible "business") échouait alors que "me/accounts"
 * (les pages) répondait normalement — et bloquait donc à tort la sélection
 * de page dans le wizard alors que les pages étaient parfaitement accessibles.
 * On ne demande plus le champ "business" (non utilisé par l'appelant), et
 * chaque appel a maintenant son propre résultat/erreur.
 */
export async function fetchMetaResources(accountId: string, accessToken: string) {
  const account = graphUrl(accountId, { fields: "id,name,account_status,currency", access_token: accessToken });
  const pages = graphUrl("me/accounts", { fields: "id,name,access_token,instagram_business_account", limit: "100", access_token: accessToken });
  const pixels = graphUrl(`${accountId}/adspixels`, { fields: "id,name", limit: "100", access_token: accessToken });

  const [accountResult, pagesResult, pixelsResult] = await Promise.all([
    fetch(account, { cache: "no-store" }).then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => ({})) })),
    fetch(pages, { cache: "no-store" }).then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => ({})) })),
    fetch(pixels, { cache: "no-store" }).then(async (r) => ({ ok: r.ok, json: await r.json().catch(() => ({})) })),
  ]);

  const errorMessage = (result: { ok: boolean; json: Record<string, unknown> }) =>
    typeof (result.json as { error?: { message?: unknown } })?.error?.message === "string"
      ? String((result.json as { error?: { message?: string } }).error!.message)
      : null;

  return {
    account: accountResult.ok ? accountResult.json : {},
    accountError: accountResult.ok ? null : errorMessage(accountResult) ?? "Impossible de lire le compte Meta",
    pages: pagesResult.ok && Array.isArray((pagesResult.json as { data?: unknown }).data) ? (pagesResult.json as { data: unknown[] }).data : [],
    pagesError: pagesResult.ok ? null : errorMessage(pagesResult) ?? "Impossible de lire les pages Facebook",
    pixels: pixelsResult.ok && Array.isArray((pixelsResult.json as { data?: unknown }).data) ? (pixelsResult.json as { data: unknown[] }).data : [],
  };
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
  for (const type of types) {
    const action = actions.find((item) => item && typeof item === "object" && String((item as { action_type?: unknown }).action_type) === type) as { value?: unknown } | undefined;
    if (!action) continue;
    const value = Number(action.value ?? 0);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
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
// Raison lisible pour chaque état account_status documenté par Meta.
const META_ACCOUNT_STATUS_REASON: Record<number, string> = {
  1: "actif",
  2: "compte désactivé",
  3: "solde impayé",
  7: "en revue de risque",
  8: "en attente de règlement",
  9: "en période de grâce",
  100: "en cours de fermeture",
  101: "compte fermé",
  201: "au moins un compte actif",
  202: "tous les comptes fermés",
};

export function describeMetaAccountStatus(status: number): string {
  return META_ACCOUNT_STATUS_REASON[status] ?? `état inconnu (code ${status})`;
}

// Les statuts compte agrégés 201/202 sont également documentés par Meta.
// 8/9 et 201 ne suffisent pas à conclure à une panne : on se fie au statut effectif.
export function isMetaAccountStatusBlocking(status: number | null | undefined): boolean {
  return typeof status === "number" && [2, 3, 7, 100, 101, 202].includes(status);
}

export function describeMetaFundingIssue(funding: { accountStatus: number; hasFundingSource: boolean }): { code: string; message: string } | null {
  if (![1, 8, 9, 201].includes(funding.accountStatus)) {
    const reason = describeMetaAccountStatus(funding.accountStatus);
    return { code: "META_ACCOUNT_RESTRICTED", message: `Ce compte publicitaire Meta n'est pas actif (${reason}). Vérifie son état dans Meta Account Quality avant de relancer.` };
  }
  if (!funding.hasFundingSource) {
    return { code: "META_NO_PAYMENT_METHOD", message: "Aucun moyen de paiement n'est configuré sur ce compte Meta Ads. Ajoute une carte dans Meta Business Manager (Facturation) avant de lancer une campagne." };
  }
  return null;
}

export interface MetaGeoSuggestion {
  key: string;
  name: string;
  type: "country" | "region" | "city";
  countryCode: string;
}

/**
 * Widget de recherche d'audience (étape 3 du wizard "Lancer une pub") : renvoie
 * les régions/villes correspondant à la recherche via l'endpoint de recherche
 * de lieux de Meta (type=adgeolocation). Les pays sont gérés localement
 * (lib/geo/countries.ts) — on ne demande donc à Meta que region/city ici, pour
 * ne pas dupliquer les pays déjà couverts côté client.
 */
export async function searchMetaGeoLocations(query: string, accessToken: string): Promise<MetaGeoSuggestion[]> {
  const url = graphUrl("search", {
    type: "adgeolocation",
    q: query,
    location_types: JSON.stringify(["region", "city"]),
    limit: "10",
    access_token: accessToken,
  });
  const response = await fetch(url, { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof json?.error?.message === "string" ? json.error.message : "Recherche de lieu Meta indisponible");
  const rows = Array.isArray(json.data) ? json.data as Array<Record<string, unknown>> : [];
  return rows
    .map((row) => {
      const type = row.type === "region" ? "region" as const : "city" as const;
      const countryCode = typeof row.country_code === "string" ? row.country_code.toUpperCase() : "";
      const region = typeof row.region === "string" ? row.region : null;
      const countryName = typeof row.country_name === "string" ? row.country_name : null;
      const name = typeof row.name === "string" ? row.name : "";
      // Meta ne renvoie pas toujours le pays/la région dans le libellé lui-même
      // (ex: "Paris" tout court) — on les ajoute pour lever toute ambiguïté
      // dans la liste de suggestions (il existe plusieurs "Paris" dans le monde).
      const suffix = [type === "city" ? region : null, countryName].filter(Boolean).join(", ");
      return {
        key: String(row.key ?? ""),
        name: suffix ? `${name}, ${suffix}` : name,
        type,
        countryCode,
      };
    })
    .filter((row) => row.key && row.name && row.countryCode);
}
