import { TIKTOK_API_BASE_URL } from "./api";

export type TikTokCampaignStats = {
  campaignId: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number; // en %
  cpc: number;
};

// Rapport par campagne sur une période (report/integrated/get, niveau campagne).
// Métriques volontairement limitées aux plus standard pour éviter un rejet complet
// de la requête ; CTR et CPC sont recalculés ici plutôt que lus chez TikTok.
export async function fetchTikTokCampaignReport(advertiserId: string, accessToken: string, from: string, to: string): Promise<TikTokCampaignStats[]> {
  const url = new URL(`${TIKTOK_API_BASE_URL}/report/integrated/get/`);
  url.searchParams.set("advertiser_id", advertiserId);
  url.searchParams.set("report_type", "BASIC");
  url.searchParams.set("data_level", "AUCTION_CAMPAIGN");
  url.searchParams.set("dimensions", JSON.stringify(["campaign_id"]));
  url.searchParams.set("metrics", JSON.stringify(["campaign_name", "spend", "impressions", "clicks", "conversion"]));
  url.searchParams.set("start_date", from);
  url.searchParams.set("end_date", to);
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "200");
  const response = await fetch(url, { headers: { "Access-Token": accessToken }, cache: "no-store" });
  const json = (await response.json().catch(() => ({}))) as { code?: number; message?: string; data?: { list?: Array<{ dimensions?: Record<string, unknown>; metrics?: Record<string, unknown> }> } };
  if (!response.ok || json.code !== 0) throw new Error(json.message || `TikTok report failed (${response.status})`);
  return (json.data?.list ?? []).map((row) => {
    const m = row.metrics ?? {};
    const spend = Number(m.spend ?? 0) || 0;
    const impressions = Number(m.impressions ?? 0) || 0;
    const clicks = Number(m.clicks ?? 0) || 0;
    return {
      campaignId: String(row.dimensions?.campaign_id ?? ""),
      name: typeof m.campaign_name === "string" && m.campaign_name ? m.campaign_name : `Campagne ${row.dimensions?.campaign_id ?? ""}`,
      spend,
      impressions,
      clicks,
      conversions: Number(m.conversion ?? 0) || 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
    };
  });
}
