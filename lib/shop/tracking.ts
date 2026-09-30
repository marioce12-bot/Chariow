// Paramètres de suivi conservés jusqu'au lien de paiement Chariow.
export const FORWARDED_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"] as const;
export const VISITOR_COOKIE = "vendeo_visitor_id";

export type TrackingParams = Partial<Record<(typeof FORWARDED_PARAMS)[number], string>>;

export function pickTrackingParams(source: URLSearchParams | Record<string, string | string[] | undefined>): TrackingParams {
  const result: TrackingParams = {};
  for (const key of FORWARDED_PARAMS) {
    const raw = source instanceof URLSearchParams ? source.get(key) : source[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value === "string" && value.trim() && value.length <= 255) result[key] = value.trim();
  }
  return result;
}

export function trackingQueryString(params: TrackingParams): string {
  const search = new URLSearchParams();
  for (const key of FORWARDED_PARAMS) if (params[key]) search.set(key, params[key] as string);
  return search.toString();
}

// Ajoute les paramètres de suivi au lien de paiement sans écraser ceux déjà présents.
export function withTrackingParams(target: string, params: TrackingParams): string {
  const url = new URL(target);
  for (const key of FORWARDED_PARAMS) {
    const value = params[key];
    if (value && !url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function readVisitorId(cookieHeader: string | null): string | null {
  const raw = cookieHeader?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${VISITOR_COOKIE}=`))?.slice(VISITOR_COOKIE.length + 1);
  return raw && raw.length <= 128 && /^[A-Za-z0-9-]+$/.test(raw) ? raw : null;
}
