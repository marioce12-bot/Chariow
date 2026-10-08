const PINTEREST_API_BASE_URL = "https://api.pinterest.com/v5";

export type PinterestCampaignReport = {
  id: string;
  name: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  cpa: number | null;
};

const COLUMNS = ["SPEND_IN_MICRO_DOLLAR", "IMPRESSION_1", "CLICKTHROUGH_1", "TOTAL_CONVERSIONS"];

async function pinterestGet(path: string, accessToken: string): Promise<unknown> {
  const response = await fetch(`${PINTEREST_API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof json?.message === "string" ? json.message : `Pinterest request failed (${response.status})`;
    throw new Error(message);
  }
  return json;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function listCampaigns(adAccountId: string, accessToken: string) {
  const campaigns: Array<{ id: string; name: string }> = [];
  let bookmark: string | null = null;
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ page_size: "100" });
    if (bookmark) query.set("bookmark", bookmark);
    const json = (await pinterestGet(`/ad_accounts/${encodeURIComponent(adAccountId)}/campaigns?${query.toString()}`, accessToken)) as { items?: Array<Record<string, unknown>>; bookmark?: string | null };
    for (const item of json.items ?? []) {
      if (item.id) campaigns.push({ id: String(item.id), name: typeof item.name === "string" ? item.name : String(item.id) });
    }
    bookmark = typeof json.bookmark === "string" && json.bookmark ? json.bookmark : null;
    if (!bookmark) break;
  }
  return campaigns;
}

// Stats Pinterest Ads par campagne (lecture seule). Le montant dépensé est renvoyé en
// micro-unités de la devise du compte, d'où la division par 1 000 000.
export async function fetchPinterestCampaignReport(adAccountId: string, accessToken: string, from: string, to: string): Promise<PinterestCampaignReport[]> {
  const campaigns = await listCampaigns(adAccountId, accessToken);
  if (!campaigns.length) return [];
  const names = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
  const totals = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number }>();

  for (let index = 0; index < campaigns.length; index += 100) {
    const ids = campaigns.slice(index, index + 100).map((campaign) => campaign.id);
    const query = new URLSearchParams({
      start_date: from,
      end_date: to,
      campaign_ids: ids.join(","),
      columns: COLUMNS.join(","),
      granularity: "TOTAL",
    });
    const rows = await pinterestGet(`/ad_accounts/${encodeURIComponent(adAccountId)}/campaigns/analytics?${query.toString()}`, accessToken);
    if (!Array.isArray(rows)) continue;
    for (const row of rows as Array<Record<string, unknown>>) {
      const metrics = (row.metrics && typeof row.metrics === "object" ? row.metrics : row) as Record<string, unknown>;
      const id = String(row.CAMPAIGN_ID ?? metrics.CAMPAIGN_ID ?? "");
      if (!id) continue;
      const current = totals.get(id) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
      current.spend += toNumber(metrics.SPEND_IN_MICRO_DOLLAR) / 1_000_000;
      current.impressions += toNumber(metrics.IMPRESSION_1);
      current.clicks += toNumber(metrics.CLICKTHROUGH_1);
      current.conversions += toNumber(metrics.TOTAL_CONVERSIONS);
      totals.set(id, current);
    }
  }

  return Array.from(totals.entries())
    .filter(([, value]) => value.spend > 0 || value.impressions > 0 || value.clicks > 0)
    .map(([id, value]) => ({
      id,
      name: names.get(id) ?? id,
      impressions: value.impressions,
      clicks: value.clicks,
      spend: value.spend,
      conversions: value.conversions,
      cpa: value.conversions > 0 ? value.spend / value.conversions : null,
    }));
}
