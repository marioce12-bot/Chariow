export function withVendeoCampaignTracking(destination: string, campaignId: string): string {
  const url = new URL(destination);
  if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", "vendeo");
  if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "paid_social");
  if (!url.searchParams.has("utm_campaign")) url.searchParams.set("utm_campaign", campaignId);
  return url.toString();
}
