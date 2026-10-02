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
// On utilise /search/region/ (source confirmée dans le SDK officiel
// tiktok-business-api-sdk, yml_files/search_region.yml) qui renvoie, pour
// l'advertiser, la liste des zones disponibles avec `region_id` (le location_id
// numérique) et `country_code` (code ISO). C'est ce qui permet de convertir les
// codes pays choisis dans le wizard ("BJ", …) en location_ids TikTok.
export async function fetchTikTokRegions(advertiserId: string, accessToken: string) {
  const data = await tiktokRequest<{ region_list?: Array<Record<string, unknown>> }>("search/region/", { accessToken, query: { advertiser_id: advertiserId } });
  return data.region_list ?? [];
}

// Convertit des codes pays ISO (ex: "BJ") en location_ids TikTok (numériques),
// en privilégiant l'entrée "pays" (parent_id absent ou "0") quand plusieurs
// niveaux existent pour un même pays. Renvoie uniquement les ids trouvés.
export async function resolveTikTokLocationIds(advertiserId: string, accessToken: string, countryCodes: string[]): Promise<string[]> {
  const regions = await fetchTikTokRegions(advertiserId, accessToken);
  const targets = new Set(countryCodes.map((code) => code.toUpperCase()));
  const byCountry = new Map<string, string>();
  for (const region of regions) {
    const row = region as Record<string, unknown>;
    const code = String(row.country_code ?? "").toUpperCase();
    const id = String(row.region_id ?? "");
    if (!code || !id || !targets.has(code)) continue;
    const isCountryLevel = row.parent_id == null || String(row.parent_id) === "0" || String(row.parent_id) === "";
    if (!byCountry.has(code) || isCountryLevel) byCountry.set(code, id);
  }
  const returnedCountryCodes = Array.from(new Set(regions
    .map((region) => String((region as Record<string, unknown>).country_code ?? "").toUpperCase())
    .filter(Boolean))).sort();
  const resolvedCountries = countryCodes.map((code) => ({
    countryCode: code.toUpperCase(),
    locationId: byCountry.get(code.toUpperCase()) ?? null,
  }));
  // TEMP DIAGNOSTIC: remove after verifying the advertiser's TikTok geo list.
  // Deliberately exclude access tokens and advertiser IDs from production logs.
  console.info("[tiktok-region-diagnostic] country lookup", {
    requestedCountryCodes: Array.from(targets).sort(),
    regionEntryCount: regions.length,
    returnedCountryCodes,
    countryLevelLocationIds: Object.fromEntries(Array.from(byCountry.entries()).sort(([a], [b]) => a.localeCompare(b))),
    resolvedCountries,
  });
  return resolvedCountries.map(({ locationId }) => locationId).filter((id): id is string => Boolean(id));
}

// Liste les pixels TikTok (Events) de l'advertiser — requis pour l'objectif
// "ventes"/"leads" (optimization_goal CONVERT), qui ne peut pas être lancé sans
// un pixel configuré sur le tunnel de vente. Réponse: { pixels: [{ pixel_id, ... }] }.
export async function fetchTikTokPixels(advertiserId: string, accessToken: string) {
  const data = await tiktokRequest<{ pixels?: Array<Record<string, unknown>> }>("pixel/list/", { accessToken, query: { advertiser_id: advertiserId } });
  return data.pixels ?? [];
}
