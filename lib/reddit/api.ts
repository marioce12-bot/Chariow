export const REDDIT_ADS_API_BASE_URL = "https://ads-api.reddit.com/api/v3";
export const REDDIT_OAUTH_TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
export const REDDIT_OAUTH_AUTHORIZE_URL = "https://www.reddit.com/api/v1/authorize";

// User-Agent descriptif obligatoire : Reddit rate-limite agressivement les
// User-Agent par défaut (curl/, python-requests/, etc.).
const USER_AGENT = "web:vendeo-ads-integration:1.0.0 (by /u/vendeo_app)";

type RedditTokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope: string; token_type: string };

export async function exchangeRedditAuthCode(code: string, redirectUri: string): Promise<RedditTokenResponse> {
  const appId = process.env.REDDIT_APP_ID;
  const secret = process.env.REDDIT_APP_SECRET;
  if (!appId || !secret) throw new Error("Reddit Ads OAuth n'est pas configuré");
  const basicAuth = Buffer.from(`${appId}:${secret}`).toString("base64");
  // Contrairement à TikTok, Reddit suit l'OAuth2 standard : le redirect_uri
  // envoyé ici DOIT être identique à celui utilisé pour l'autorisation.
  const body = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  const response = await fetch(REDDIT_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth}`, "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error_description || json.error || `Reddit token exchange failed (${response.status})`);
  return json as RedditTokenResponse;
}

async function redditAdsRequest<T = Record<string, unknown>>(path: string, accessToken: string, options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {}): Promise<{ status: number; ok: boolean; data: T | null; raw: unknown }> {
  const response = await fetch(`${REDDIT_ADS_API_BASE_URL}/${path}`, {
    method: options.method ?? "GET",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const raw = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, data: response.ok ? ((raw as { data?: T })?.data ?? (raw as T)) : null, raw };
}

export async function fetchRedditBusinesses(accessToken: string) {
  const result = await redditAdsRequest<Array<Record<string, unknown>>>("me/businesses", accessToken);
  return Array.isArray(result.data) ? result.data : [];
}

// L'objet ad_account renvoyé par Reddit inclut un champ "admin_approval" —
// c'est notre preuve empirique directe (pas une doc tierce contradictoire).
export async function fetchRedditAdAccounts(businessId: string, accessToken: string) {
  const result = await redditAdsRequest<Array<Record<string, unknown>>>(`businesses/${businessId}/ad_accounts`, accessToken);
  return Array.isArray(result.data) ? result.data : [];
}

// Test empirique : tente de créer une campagne en PAUSED (donc sans dépense).
// On retourne le status + la réponse brute de Reddit, quel que soit le résultat,
// pour trancher entre "bloqué par une approbation" et "juste un souci de payload".
export async function testCreateDraftCampaign(adAccountId: string, accessToken: string) {
  return redditAdsRequest(`ad_accounts/${adAccountId}/campaigns`, accessToken, {
    method: "POST",
    body: {
      name: "Vendeo - test d'accès API (à supprimer)",
      objective: "APP_INSTALLS",
      configured_status: "PAUSED",
    },
  });
}
