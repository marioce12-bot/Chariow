import crypto from "node:crypto";

export const X_ADS_API_VERSION = process.env.X_ADS_API_VERSION ?? "12";
export const X_ADS_API_BASE_URL = process.env.X_ADS_API_BASE_URL ?? `https://ads-api.x.com/${X_ADS_API_VERSION}`;
const X_API_BASE_URL = "https://api.x.com";

type OAuthParams = Record<string, string>;

type XAccount = {
  id?: string;
  name?: string;
  currency?: string;
  timezone?: string;
  approval_status?: string;
  deleted?: boolean;
};

function percentEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function normalizedParams(params: OAuthParams) {
  return Object.entries(params)
    .sort(([aKey, aValue], [bKey, bValue]) => aKey.localeCompare(bKey) || aValue.localeCompare(bValue))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join("&");
}

function oauthHeader(method: string, url: string, consumerKey: string, consumerSecret: string, token?: string, tokenSecret?: string, extra: OAuthParams = {}) {
  const oauth: OAuthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
    ...extra,
  };
  if (token) oauth.oauth_token = token;
  const parsed = new URL(url);
  const query: OAuthParams = {};
  parsed.searchParams.forEach((value, key) => { query[key] = value; });
  const signatureBase = [method.toUpperCase(), percentEncode(`${parsed.origin}${parsed.pathname}`), percentEncode(normalizedParams({ ...query, ...oauth }))].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret ?? "")}`;
  oauth.oauth_signature = crypto.createHmac("sha1", signingKey).update(signatureBase).digest("base64");
  return `OAuth ${Object.entries(oauth).map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`).join(", ")}`;
}

function credentials() {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_SECRET;
  if (!consumerKey || !consumerSecret) throw new Error("X Ads OAuth n'est pas configuré");
  return { consumerKey, consumerSecret };
}

async function oauthFormRequest(url: string, method: "GET" | "POST", authorization: string, body?: URLSearchParams) {
  const response = await fetch(url, {
    method,
    headers: { Authorization: authorization, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: body?.toString(),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`X OAuth request failed (${response.status}): ${text.slice(0, 300)}`);
  return new URLSearchParams(text);
}

export async function requestXAdsToken() {
  const { consumerKey, consumerSecret } = credentials();
  const redirectUri = process.env.X_ADS_OAUTH_REDIRECT_URI;
  if (!redirectUri) throw new Error("X_ADS_OAUTH_REDIRECT_URI n'est pas configuré");
  const url = `${X_API_BASE_URL}/oauth/request_token`;
  const params = { oauth_callback: redirectUri };
  const result = await oauthFormRequest(url, "POST", oauthHeader("POST", url, consumerKey, consumerSecret, undefined, undefined, params));
  const token = result.get("oauth_token");
  const secret = result.get("oauth_token_secret");
  if (!token || !secret) throw new Error("X n'a pas renvoyé de request token");
  return { token, secret };
}

export function xAuthorizeUrl(requestToken: string) {
  const url = new URL(`${X_API_BASE_URL}/oauth/authorize`);
  url.searchParams.set("oauth_token", requestToken);
  return url.toString();
}

export async function exchangeXAdsToken(requestToken: string, requestTokenSecret: string, verifier: string) {
  const { consumerKey, consumerSecret } = credentials();
  const url = `${X_API_BASE_URL}/oauth/access_token`;
  const result = await oauthFormRequest(url, "POST", oauthHeader("POST", url, consumerKey, consumerSecret, requestToken, requestTokenSecret, { oauth_verifier: verifier }));
  const token = result.get("oauth_token");
  const secret = result.get("oauth_token_secret");
  const userId = result.get("user_id");
  const screenName = result.get("screen_name");
  if (!token || !secret) throw new Error("X n'a pas renvoyé de access token");
  return { token, secret, userId, screenName };
}

export async function fetchXAdsAccounts(accessToken: string, accessTokenSecret: string) {
  const { consumerKey, consumerSecret } = credentials();
  const url = `${X_ADS_API_BASE_URL}/accounts`;
  const response = await fetch(url, { headers: { Authorization: oauthHeader("GET", url, consumerKey, consumerSecret, accessToken, accessTokenSecret) }, cache: "no-store" });
  const json = await response.json().catch(() => ({})) as { data?: XAccount[]; errors?: unknown[] };
  if (!response.ok) throw new Error(`X Ads accounts request failed (${response.status})`);
  return (json.data ?? []).filter((account) => account.id && !account.deleted);
}
