export const COOKIE_CONSENT_STORAGE_KEY = "vendeo-cookie-consent-v1";
export const COOKIE_CONSENT_CHANGED_EVENT = "vendeo-cookie-consent-changed";

export type CookieConsentRecord = {
  essential: true;
  marketing: boolean;
  updatedAt: string;
};

let sessionFallback: CookieConsentRecord | null = null;

export function readCookieConsent(): CookieConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CookieConsentRecord>;
      if (parsed.essential === true && typeof parsed.marketing === "boolean" && typeof parsed.updatedAt === "string") {
        sessionFallback = parsed as CookieConsentRecord;
        return sessionFallback;
      }
    }
  } catch {
    // Si le stockage local est indisponible, le choix reste valable pour la session en cours.
  }
  return sessionFallback;
}

export function hasMarketingConsent(): boolean {
  return readCookieConsent()?.marketing === true;
}

export function clearOptionalTrackingCookies() {
  if (typeof document === "undefined") return;
  for (const name of ["_fbp", "_fbc", "vendeo_visitor_id"]) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    const host = window.location.hostname;
    if (host.includes(".")) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${host}; SameSite=Lax`;
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.${host}; SameSite=Lax`;
    }
  }
}

export function saveCookieConsent(marketing: boolean): CookieConsentRecord {
  const record: CookieConsentRecord = { essential: true, marketing, updatedAt: new Date().toISOString() };
  sessionFallback = record;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Le choix s'applique à cette session même si le stockage local est bloqué.
    }
    if (!marketing) clearOptionalTrackingCookies();
    window.dispatchEvent(new CustomEvent(COOKIE_CONSENT_CHANGED_EVENT, { detail: record }));
  }
  return record;
}
