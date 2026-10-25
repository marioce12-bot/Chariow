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

type ReportRow = {
  dimensions?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
};

type ReportEnvelope = {
  code?: unknown;
  message?: unknown;
  data?: {
    list?: unknown;
    page_info?: unknown;
  };
};

const REQUEST_PAGE_SIZE = 200;
const MAX_REPORT_PAGES = 10;

const num = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function positiveInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function pageInfoFor(data: NonNullable<ReportEnvelope["data"]>, requestedPage: number) {
  const raw = data.page_info;
  if (raw !== undefined && (!raw || typeof raw !== "object" || Array.isArray(raw))) {
    throw new Error(`TikTok returned invalid report pagination metadata: page_info must be an object (received ${JSON.stringify(raw)})`);
  }
  const info = (raw ?? {}) as Record<string, unknown>;
  const receivedPage = info.page === undefined ? requestedPage : positiveInteger(info.page);
  if (receivedPage === null || receivedPage !== requestedPage) {
    throw new Error(`TikTok returned invalid report pagination metadata for requested page ${requestedPage} (received ${JSON.stringify(raw)})`);
  }
  const pageSize = info.page_size === undefined ? REQUEST_PAGE_SIZE : positiveInteger(info.page_size);
  if (pageSize === null) {
    throw new Error(`TikTok returned invalid report pagination metadata: page_size must be a positive integer (received ${JSON.stringify(raw)})`);
  }

  let totalPages: number | undefined;
  if (info.total_page !== undefined) {
    if (info.total_page === 0 || info.total_page === "0") totalPages = 0;
    else {
      totalPages = positiveInteger(info.total_page) ?? undefined;
      if (totalPages === undefined) {
        throw new Error(`TikTok returned invalid report pagination metadata: total_page must be a non-negative integer (received ${JSON.stringify(raw)})`);
      }
    }
  }
  return { pageSize, totalPages };
}

async function fetchTikTokReportRows(
  advertiserId: string,
  accessToken: string,
  from: string,
  to: string,
  dataLevel: "AUCTION_CAMPAIGN" | "AUCTION_AD",
  dimension: "campaign_id" | "ad_id",
  nameMetric: "campaign_name" | "ad_name",
): Promise<ReportRow[]> {
  const rows: ReportRow[] = [];
  let page = 1;

  while (page <= MAX_REPORT_PAGES) {
    const url = new URL(`${TIKTOK_API_BASE_URL}/report/integrated/get/`);
    url.searchParams.set("advertiser_id", advertiserId);
    url.searchParams.set("report_type", "BASIC");
    url.searchParams.set("data_level", dataLevel);
    url.searchParams.set("dimensions", JSON.stringify([dimension]));
    url.searchParams.set("metrics", JSON.stringify([nameMetric, "spend", "impressions", "clicks", "conversion"]));
    url.searchParams.set("start_date", from);
    url.searchParams.set("end_date", to);
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", String(REQUEST_PAGE_SIZE));

    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json", "Access-Token": accessToken },
      cache: "no-store",
    });
    const json = (await response.json().catch(() => null)) as ReportEnvelope | null;
    const message = typeof json?.message === "string" && json.message.trim() ? json.message : null;

    if (!response.ok) throw new Error(message || `TikTok report failed (HTTP ${response.status})`);
    if (!json || typeof json !== "object") throw new Error("TikTok returned an invalid report response");
    // TikTok's SDK marks `code` optional on successful responses. Preserve a real API error;
    // do not treat an omitted success code as an error or an empty report.
    if (json.code !== undefined && json.code !== 0) {
      throw new Error(`TikTok report API error (${String(json.code)}): ${message || "no message returned"}`);
    }
    if (!json.data || typeof json.data !== "object" || Array.isArray(json.data)) {
      throw new Error("TikTok returned an invalid report data object");
    }
    const rawList = json.data.list;
    if (rawList !== undefined && !Array.isArray(rawList)) {
      throw new Error("TikTok returned an invalid report list");
    }
    const pageRows = (rawList ?? []) as ReportRow[];
    const { pageSize, totalPages } = pageInfoFor(json.data, page);

    if (totalPages === 0) {
      if (pageRows.length !== 0 || page !== 1) {
        throw new Error(`TikTok returned inconsistent empty report pagination metadata (received ${JSON.stringify(json.data.page_info)})`);
      }
      return [];
    }
    if (totalPages !== undefined && page > totalPages) {
      throw new Error(`TikTok returned inconsistent report pagination metadata (page ${page} exceeds total_page ${totalPages})`);
    }
    if (totalPages !== undefined && page < totalPages && pageRows.length === 0) {
      throw new Error(`TikTok report pagination advertises another page but returned no rows (received ${JSON.stringify(json.data.page_info)})`);
    }

    rows.push(...pageRows);
    const hasMore = totalPages === undefined ? pageRows.length >= pageSize : page < totalPages;
    if (!hasMore) return rows;
    if (page >= MAX_REPORT_PAGES) {
      const total = totalPages === undefined ? "more" : String(totalPages);
      throw new Error(`TikTok report is truncated: retrieved ${page} of ${total} pages`);
    }
    page += 1;
  }

  throw new Error(`TikTok report is truncated: exceeded ${MAX_REPORT_PAGES} pages`);
}

function aggregateReportRows(rows: ReportRow[], dimension: "campaign_id" | "ad_id", nameMetric: "campaign_name" | "ad_name") {
  const byId = new Map<string, { id: string; name: string; impressions: number; clicks: number; spend: number; conversions: number; cpa: number | null }>();
  for (const row of rows) {
    const id = String(row.dimensions?.[dimension] ?? "");
    if (!id) continue;
    const metrics = row.metrics ?? {};
    const spend = num(metrics.spend);
    const conversions = num(metrics.conversion);
    const existing = byId.get(id);
    if (existing) {
      existing.spend += spend;
      existing.impressions += num(metrics.impressions);
      existing.clicks += num(metrics.clicks);
      existing.conversions += conversions;
      existing.cpa = existing.conversions > 0 ? existing.spend / existing.conversions : null;
    } else {
      byId.set(id, {
        id,
        name: String(metrics[nameMetric] ?? id),
        impressions: num(metrics.impressions),
        clicks: num(metrics.clicks),
        spend,
        conversions,
        cpa: conversions > 0 ? spend / conversions : null,
      });
    }
  }
  return Array.from(byId.values());
}

// Rapport BASIC campagne en lecture seule. `page_info.page` et `page_size` sont documentés;
// `total_page` n'est pas présent dans certains modèles v1.3, donc la longueur de liste sert
// de repli, sans déclarer complète une pagination tronquée.
export async function fetchTikTokCampaignReport(advertiserId: string, accessToken: string, from: string, to: string): Promise<TikTokCampaignStats[]> {
  const rows = await fetchTikTokReportRows(advertiserId, accessToken, from, to, "AUCTION_CAMPAIGN", "campaign_id", "campaign_name");
  return aggregateReportRows(rows, "campaign_id", "campaign_name");
}

// Rapport BASIC au niveau annonce. Aucun chiffre de campagne n'est réparti sur ses annonces.
export async function fetchTikTokAdReport(advertiserId: string, accessToken: string, from: string, to: string): Promise<TikTokAdStats[]> {
  const rows = await fetchTikTokReportRows(advertiserId, accessToken, from, to, "AUCTION_AD", "ad_id", "ad_name");
  return aggregateReportRows(rows, "ad_id", "ad_name");
}
