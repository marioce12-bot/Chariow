import { TIKTOK_API_BASE_URL } from "./api";

// Rapport TikTok Ads par campagne (API Reporting v1.3, /report/integrated/get/).
// On ne demande que des métriques de base pour éviter qu'une métrique non
// disponible sur un compte fasse échouer tout l'appel.

export type TikTokCampaignReportRow = {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
};

type ReportEnvelope = {
  code: number;
  message: string;
  data?: {
    list?: Array<{ dimensions?: Record<string, unknown>; metrics?: Record<string, unknown> }>;
    page_info?: { total_page?: number };
  };
};

export async function fetchTikTokCampaignReport(advertiserId: string, accessToken: string, from: string, to: string): Promise<TikTokCampaignReportRow[]> {
  const rows: TikTokCampaignReportRow[] = [];
  for (let page = 1; page <= 10; page++) {
    const url = new URL(`${TIKTOK_API_BASE_URL}/report/integrated/get/`);
    url.searchParams.set("advertiser_id", advertiserId);
    url.searchParams.set("report_type", "BASIC");
    url.searchParams.set("data_level", "AUCTION_CAMPAIGN");
    url.searchParams.set("dimensions", JSON.stringify(["campaign_id"]));
    url.searchParams.set("metrics", JSON.stringify(["campaign_name", "spend", "impressions", "clicks", "conversion"]));
    url.searchParams.set("start_date", from);
    url.searchParams.set("end_date", to);
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", "200");
    const response = await fetch(url, { headers: { "Content-Type": "application/json", "Access-Token": accessToken }, cache: "no-store" });
    const json = (await response.json().catch(() => ({}))) as ReportEnvelope;
    if (!response.ok || json.code !== 0) throw new Error(json.message || `TikTok report failed (${response.status})`);
    for (const item of json.data?.list ?? []) {
      const metrics = item.metrics ?? {};
      const id = String(item.dimensions?.campaign_id ?? "");
      if (!id) continue;
      rows.push({
        id,
        name: String(metrics.campaign_name ?? id),
        spend: Number(metrics.spend ?? 0) || 0,
        impressions: Number(metrics.impressions ?? 0) || 0,
        clicks: Number(metrics.clicks ?? 0) || 0,
        conversions: Number(metrics.conversion ?? 0) || 0,
      });
    }
    if (page >= (json.data?.page_info?.total_page ?? 1)) break;
  }
  return rows;
}
