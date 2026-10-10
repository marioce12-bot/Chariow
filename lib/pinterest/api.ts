import { convertCurrency } from "@/lib/currency";

const PINTEREST_API_BASE_URL = "https://api.pinterest.com/v5";

export type PinterestObjectiveInput = "sales" | "traffic" | "engagement" | "leads" | string | null | undefined;

/** Objectif Vendeo → `objective_type` Pinterest. Seul "sales" vise l'objectif SALES ;
 *  le trafic, l'engagement et les leads passent par CONSIDERATION (clics vers le site).
 *  Les objectifs AWARENESS / WEB_CONVERSION exigent des paramètres supplémentaires
 *  (enchère, balise de conversion) que le flux Vendeo ne collecte pas. */
export function toPinterestObjective(objective: PinterestObjectiveInput): "SALES" | "CONSIDERATION" {
  return objective === "sales" ? "SALES" : "CONSIDERATION";
}

async function pinterestFetch(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(`${PINTEREST_API_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof json?.message === "string" ? json.message : typeof json?.error === "string" ? json.error : `Pinterest request failed (${response.status})`;
    throw new Error(message);
  }
  return json as Record<string, unknown>;
}

/** Pinterest renvoie les erreurs d'un appel batch dans `items[i].exceptions` (tableau
 *  d'objets `{ code, message }`). On accepte aussi l'ancien champ `exception` (objet). */
export function pinterestExceptionMessage(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  const messages = list.flatMap((entry): string[] => {
    if (typeof entry === "string") return [entry];
    if (!entry || typeof entry !== "object") return [];
    const details = entry as Record<string, unknown>;
    const nested = Array.isArray(details.error_messages) ? details.error_messages.filter((value): value is string => typeof value === "string") : [];
    if (nested.length) return nested;
    return typeof details.message === "string" ? [details.message] : [];
  });
  if (messages.length) return messages.join(" ");
  return list.length ? JSON.stringify(raw).slice(0, 300) : null;
}

function firstCreatedItem(json: Record<string, unknown>, label: string) {
  const items = Array.isArray(json.items) ? json.items as Array<Record<string, unknown>> : [];
  const raw = items[0];
  const failure = pinterestExceptionMessage(raw?.exceptions ?? raw?.exception);
  if (failure) throw new Error(failure);
  const item = raw?.data && typeof raw.data === "object" ? raw.data as Record<string, unknown> : raw;
  if (!item?.id) throw new Error(`Pinterest n'a pas renvoyé d'identifiant ${label}`);
  return String(item.id);
}

export async function exchangePinterestCode(code: string, redirectUri: string) {
  const clientId = process.env.PINTEREST_APP_ID;
  const clientSecret = process.env.PINTEREST_APP_SECRET;
  if (!clientId || !clientSecret) throw new Error("Pinterest OAuth n'est pas configuré");
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${PINTEREST_API_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || typeof json.access_token !== "string") throw new Error(typeof json.message === "string" ? json.message : "Pinterest n'a pas renvoyé de jeton");
  return json as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}

export async function fetchPinterestAdAccounts(accessToken: string) {
  const json = await pinterestFetch("/ad_accounts?page_size=250&include_shared_accounts=true", accessToken);
  return Array.isArray(json.items) ? json.items as Array<Record<string, unknown>> : [];
}

async function createPinterestCampaign(adAccountId: string, accessToken: string, input: { name: string; dailySpendCapMicro: number; endTime: number; objective: PinterestObjectiveInput }) {
  const json = await pinterestFetch(`/ad_accounts/${encodeURIComponent(adAccountId)}/campaigns`, accessToken, {
    method: "POST",
    body: JSON.stringify([{
      name: input.name.slice(0, 255),
      status: "ACTIVE",
      objective_type: toPinterestObjective(input.objective),
      is_campaign_budget_optimization: true,
      daily_spend_cap: input.dailySpendCapMicro,
      end_time: input.endTime,
    }]),
  });
  return firstCreatedItem(json, "de campagne");
}

async function createPinterestAdGroup(adAccountId: string, accessToken: string, input: { campaignId: string; name: string; minAge: number; maxAge: number; countries: string[] }) {
  const json = await pinterestFetch(`/ad_accounts/${encodeURIComponent(adAccountId)}/ad_groups`, accessToken, {
    method: "POST",
    body: JSON.stringify([{
      name: input.name.slice(0, 255),
      campaign_id: input.campaignId,
      status: "ACTIVE",
      bid_strategy_type: "AUTOMATIC_BID",
      billable_event: "CLICKTHROUGH",
      placement_group: "ALL",
      auto_targeting_enabled: true,
      targeting_spec: {
        LOCATION: input.countries,
        MINIMUM_AGE: String(input.minAge),
        MAXIMUM_AGE: String(input.maxAge),
        TARGETING_STRATEGY: ["CHOOSE_YOUR_OWN"],
      },
    }]),
  });
  return firstCreatedItem(json, "de groupe d'annonces");
}

async function createPinterestPin(accessToken: string, input: { title: string; description: string; link: string; imageUrl: string; adAccountId: string }) {
  const json = await pinterestFetch(`/pins?ad_account_id=${encodeURIComponent(input.adAccountId)}`, accessToken, {
    method: "POST",
    body: JSON.stringify({
      title: input.title.slice(0, 100),
      description: input.description.slice(0, 800),
      link: input.link.slice(0, 2048),
      media_source: { source_type: "image_url", url: input.imageUrl },
    }),
  });
  if (!json.id) throw new Error("Pinterest n'a pas pu créer le Pin publicitaire");
  return String(json.id);
}

async function createPinterestAd(adAccountId: string, accessToken: string, input: { adGroupId: string; pinId: string; name: string }) {
  const json = await pinterestFetch(`/ad_accounts/${encodeURIComponent(adAccountId)}/ads`, accessToken, {
    method: "POST",
    body: JSON.stringify([{ ad_group_id: input.adGroupId, creative_type: "REGULAR", pin_id: input.pinId, name: input.name.slice(0, 255), status: "ACTIVE" }]),
  });
  return firstCreatedItem(json, "de publicité");
}

/** Devise du compte publicitaire (les montants en micro-unités sont dans CETTE devise). */
async function fetchPinterestAdAccountCurrency(adAccountId: string, accessToken: string) {
  const json = await pinterestFetch(`/ad_accounts/${encodeURIComponent(adAccountId)}`, accessToken);
  return typeof json.currency === "string" && json.currency ? json.currency.toUpperCase() : "USD";
}

/** Annule une campagne créée à moitié : on l'archive pour qu'un « Réessayer » ne laisse pas de doublon. */
async function archivePinterestCampaign(adAccountId: string, accessToken: string, campaignId: string) {
  const json = await pinterestFetch(`/ad_accounts/${encodeURIComponent(adAccountId)}/campaigns`, accessToken, {
    method: "PATCH",
    body: JSON.stringify([{ id: campaignId, status: "ARCHIVED" }]),
  });
  const items = Array.isArray(json.items) ? json.items as Array<Record<string, unknown>> : [];
  const failure = pinterestExceptionMessage(items[0]?.exceptions ?? items[0]?.exception);
  if (failure) throw new Error(failure);
}

/** `dailyBudget` est exprimé en dollars US (comme `ad_campaigns.daily_budget`) : il est converti
 *  dans la devise du compte Pinterest avant d'être envoyé en micro-unités. */
export async function launchPinterest(input: { adAccountId: string; accessToken: string; name: string; adText: string; title: string; link: string; mediaUrl: string; dailyBudget: number; durationDays: number; minAge: number; maxAge: number; countries: string[]; objective?: PinterestObjectiveInput }) {
  if (!/^https:\/\//i.test(input.mediaUrl)) throw new Error("Pinterest exige une URL HTTPS pour le visuel");
  const currency = await fetchPinterestAdAccountCurrency(input.adAccountId, input.accessToken);
  const budgetInAccountCurrency = convertCurrency(input.dailyBudget, "USD", currency);
  if (budgetInAccountCurrency === null || budgetInAccountCurrency <= 0) {
    throw new Error(`La devise du compte Pinterest (${currency}) n'est pas prise en charge pour convertir le budget. Utilise un compte en USD, EUR ou XOF.`);
  }
  const campaignId = await createPinterestCampaign(input.adAccountId, input.accessToken, {
    name: input.name,
    dailySpendCapMicro: Math.round(budgetInAccountCurrency * 1_000_000),
    endTime: Math.floor(Date.now() / 1000) + input.durationDays * 86400,
    objective: input.objective,
  });
  try {
    const adGroupId = await createPinterestAdGroup(input.adAccountId, input.accessToken, { campaignId, name: `${input.name} - Audience`, minAge: input.minAge, maxAge: input.maxAge, countries: input.countries.length ? input.countries : ["BJ"] });
    const pinId = await createPinterestPin(input.accessToken, { title: input.title || input.name, description: input.adText, link: input.link, imageUrl: input.mediaUrl, adAccountId: input.adAccountId });
    const adId = await createPinterestAd(input.adAccountId, input.accessToken, { adGroupId, pinId, name: `${input.name} - Ad` });
    return { campaignId, adGroupId, pinId, adId };
  } catch (error) {
    // La campagne existe déjà chez Pinterest : on l'archive (best-effort) pour éviter un doublon
    // à chaque nouvel essai, puis on remonte l'erreur d'origine, jamais celle du nettoyage.
    try {
      await archivePinterestCampaign(input.adAccountId, input.accessToken, campaignId);
    } catch (cleanupError) {
      console.error("Pinterest: échec de l'archivage de la campagne incomplète", { campaignId, message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) });
    }
    throw error;
  }
}
