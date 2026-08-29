export type AttributionTouch = { visitorId: string; utmSource?: string; utmMedium?: string; utmCampaign?: string; utmContent?: string; utmTerm?: string; fbclid?: string; landingUrl?: string; capturedAt: string };

export function getAttributionFromSearch(searchParams: URLSearchParams, visitorId: string): AttributionTouch | null {
  const values = { utmSource: searchParams.get("utm_source") ?? undefined, utmMedium: searchParams.get("utm_medium") ?? undefined, utmCampaign: searchParams.get("utm_campaign") ?? undefined, utmContent: searchParams.get("utm_content") ?? undefined, utmTerm: searchParams.get("utm_term") ?? undefined, fbclid: searchParams.get("fbclid") ?? undefined };
  if (!Object.values(values).some(Boolean)) return null;
  return { visitorId, ...values, landingUrl: window.location.href, capturedAt: new Date().toISOString() };
}
