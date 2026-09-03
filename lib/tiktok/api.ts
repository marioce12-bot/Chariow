export const TIKTOK_API_VERSION = process.env.TIKTOK_API_VERSION ?? "v1.3";
export const TIKTOK_API_BASE_URL = `https://business-api.tiktok.com/open_api/${TIKTOK_API_VERSION}`;

type TikTokEnvelope<T> = { code: number; message: string; request_id: string; data: T };

async function tiktokRequest<T = Record<string, unknown>>(path: string, options: { method?: "GET" | "POST"; accessToken?: string; query?: Record<string, string>; body?: Record<string, unknown> } = {}): Promise<T> {
  const url = new URL(`${TIKTOK_API_BASE_URL}/${path}`);
  if (options.query) Object.entries(options.query).forEach(([key, value]) => url.searchParams.set(key, value));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // TikTok utilise un header "Access-Token" dédié, pas "Authorization: Bearer".
  if (options.accessToken) headers["Access-Token"] = options.accessToken;
  const response = await fetch(url, { method: options.method ?? "GET", headers, body: options.body ? JSON.stringify(options.body) : undefined, cache: "no-store" });
  const json = await response.json().catch(() => ({})) as TikTokEnvelope<T>;
  if (!response.ok || json.code !== 0) throw new Error(json.message || `TikTok request failed (${response.status})`);
  return json.data;
}

export async function exchangeTikTokAuthCode(authCode: string) {
  const appId = process.env.TIKTOK_APP_ID;
  const secret = process.env.TIKTOK_APP_SECRET;
  if (!appId || !secret) throw new Error("TikTok Ads OAuth n'est pas configuré");
  // Le token retourné est long-lived (pas d'expiration fixe, invalidé seulement si révoqué).
  return tiktokRequest<{ access_token: string; advertiser_ids: string[]; scope: number[] }>("oauth2/access_token/", { method: "POST", body: { app_id: appId, secret, auth_code: authCode } });
}

export async function fetchTikTokAdvertiserInfo(advertiserIds: string[], accessToken: string) {
  const data = await tiktokRequest<{ list: Array<Record<string, unknown>> }>("advertiser/info/", { accessToken, query: { advertiser_ids: JSON.stringify(advertiserIds) } });
  return data.list ?? [];
}

// Équivalent des "pages Facebook" : une identité TikTok (compte lié, ou identité personnalisée)
// est obligatoire pour publier une publicité. À appeler avant de lancer une campagne.
export async function fetchTikTokIdentities(advertiserId: string, accessToken: string) {
  const data = await tiktokRequest<{ identity_list: Array<Record<string, unknown>> }>("identity/get/", { accessToken, query: { advertiser_id: advertiserId } });
  return data.identity_list ?? [];
}

// TikTok cible par location_id numérique (pas par code ISO comme Meta "BJ").
// À appeler une fois pour récupérer et mettre en cache les IDs des pays qui t'intéressent.
export async function fetchTikTokRegions(advertiserId: string, accessToken: string) {
  const data = await tiktokRequest<{ region_list: Array<Record<string, unknown>> }>("tool/region/", { accessToken, query: { advertiser_id: advertiserId, placements: JSON.stringify(["PLACEMENT_TIKTOK"]) } });
  return data.region_list ?? [];
}
