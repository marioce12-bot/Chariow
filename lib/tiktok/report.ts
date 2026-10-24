import { TIKTOK_API_BASE_URL } from "./api";

export type TikTokCampaignStats = {
  id: string;
  name: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  cpa: number | null;
};

export type TikTokAdStats = {
  id: string;
  name: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  cpa: number | null;
};

type ReportEnvelope = {
  code: number;
  message: string;
  data?: {
    list?: Array<{ dimensions?: Record<string, unknown>; metrics?: Record<string, unknown> }>;
    page_info?: { page?: number; total_page?: number };
  };
};

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

// Rapport de performance par campagne (TikTok Business API, report/integrated/get).
// Lecture seule : dépenses, impressions, clics, conversions. Les dates sont au format YYYY-MM-DD.
export async function fetchTikTokCampaignReport(advertiserId: string, accessToken: string, from: string, to: string): Promise<TikTokCampaignStats[]> {
  const byCampaign = new Map<string, TikTokCampaignStats>();
  let page = 1;
  let totalPage = 1;
  do {
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
    const response = await fetch(url, { method: "GET", headers: { "Content-Type": "application/json", "Access-Token": accessToken }, cache: "no-store" });
    const json = (await response.json().catch(() => ({}))) as ReportEnvelope;
    if (!response.ok || json.code !== 0) throw new Error(json.message || `TikTok report failed (${response.status})`);
    for (const row of json.data?.list ?? []) {
      const id = String(row.dimensions?.campaign_id ?? "");
      if (!id) continue;
      const metrics = row.metrics ?? {};
      const spend = num(metrics.spend);
      const conversions = num(metrics.conversion);
      const existing = byCampaign.get(id);
      if (existing) {
        existing.spend += spend;
        existing.impressions += num(metrics.impressions);
        existing.clicks += num(metrics.clicks);
        existing.conversions += conversions;
        existing.cpa = existing.conversions > 0 ? existing.spend / existing.conversions : null;
      } else {
        byCampaign.set(id, { id, name: String(metrics.campaign_name ?? id), impressions: num(metrics.impressions), clicks: num(metrics.clicks), spend, conversions, cpa: conversions > 0 ? spend / conversions : null });
      }
    }
    totalPage = json.data?.page_info?.total_page ?? 1;
    if (!Number.isFinite(totalPage) || totalPage < 1) throw new Error("TikTok returned invalid report pagination metadata");
    if (page < totalPage && page >= 10) throw new Error(`TikTok campaign report is truncated: retrieved ${page} of ${totalPage} pages`);
    page += 1;
  } while (page <= totalPage);
  return Array.from(byCampaign.values());
}

// Rapport BASIC par annonce. L'API renvoie ad_id dans dimensions et ad_name dans metrics.
// Une limite de dix pages est volontaire : mieux vaut échouer que renvoyer un rapport tronqué.
export async function fetchTikTokAdReport(advertiserId: string, accessToken: string, from: string, to: string): Promise<TikTokAdStats[]> {
  const byAd = new Map<string, TikTokAdStats>();
  let page = 1;
  let totalPage = 1;
  do {
    const url = new URL(`${TIKTOK_API_BASE_URL}/report/integrated/get/`);
    url.searchParams.set("advertiser_id", advertiserId);
    url.searchParams.set("report_type", "BASIC");
    url.searchParams.set("data_level", "AUCTION_AD");
    url.searchParams.set("dimensions", JSON.stringify(["ad_id"]));
    url.searchParams.set("metrics", JSON.stringify(["ad_name", "spend", "impressions", "clicks", "conversion"]));
    url.searchParams.set("start_date", from);
    url.searchParams.set("end_date", to);
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", "200");
    const response = await fetch(url, { method: "GET", headers: { "Content-Type": "application/json", "Access-Token": accessToken }, cache: "no-store" });
    const json = (await response.json().catch(() => ({}))) as ReportEnvelope;
    if (!response.ok || json.code !== 0) throw new Error(json.message || `TikTok report failed (${response.status})`);
    for (const row of json.data?.list ?? []) {
      const id = String(row.dimensions?.ad_id ?? "");
      if (!id) continue;
      const metrics = row.metrics ?? {};
      const spend = num(metrics.spend);
      const conversions = num(metrics.conversion);
      const existing = byAd.get(id);
      if (existing) {
        existing.spend += spend;
        existing.impressions += num(metrics.impressions);
        existing.clicks += num(metrics.clicks);
        existing.conversions += conversions;
        existing.cpa = existing.conversions > 0 ? existing.spend / existing.conversions : null;
      } else {
        byAd.set(id, { id, name: String(metrics.ad_name ?? id), impressions: num(metrics.impressions), clicks: num(metrics.clicks), spend, conversions, cpa: conversions > 0 ? spend / conversions : null });
      }
    }
    totalPage = json.data?.page_info?.total_page ?? 1;
    if (!Number.isFinite(totalPage) || totalPage < 1) throw new Error("TikTok returned invalid report pagination metadata");
    if (page < totalPage && page >= 10) throw new Error(`TikTok ad report is truncated: retrieved ${page} of ${totalPage} pages`);
    page += 1;
  } while (page <= totalPage);
  return Array.from(byAd.values());
}
