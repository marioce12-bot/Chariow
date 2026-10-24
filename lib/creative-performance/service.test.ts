import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/crypto", () => ({ decryptSecret: vi.fn(() => "access-token") }));
vi.mock("@/lib/tiktok/report", () => ({
  fetchTikTokCampaignReport: vi.fn(),
  fetchTikTokAdReport: vi.fn(),
}));
vi.mock("@/lib/pinterest/report", () => ({
  fetchPinterestCampaignReport: vi.fn(),
  fetchPinterestAdReport: vi.fn(),
}));

import { fetchPinterestAdReport, fetchPinterestCampaignReport } from "@/lib/pinterest/report";
import { fetchTikTokAdReport, fetchTikTokCampaignReport } from "@/lib/tiktok/report";
import { loadCreativePerformance } from "./service";

const period = { from: "2026-09-25", to: "2026-10-24" };

function campaign(overrides: Record<string, unknown> = {}) {
  return {
    id: "campaign-1", store_id: "store-1", product_id: "product-1", product_name: "Produit test",
    platform: "tiktok", status: "active", title: "Campagne test", media_url: null, carousel_urls: [],
    external_campaign_id: "native-campaign-1", external_ad_id: "native-ad-1",
    meta_ad_account_id: null, tiktok_ad_account_id: "tiktok-account-1", pinterest_ad_account_id: null,
    ...overrides,
  };
}

function placement(overrides: Record<string, unknown> = {}) {
  const campaignId = String(overrides.ad_campaign_id ?? "campaign-1");
  const assetId = String(overrides.asset_id ?? "asset-1");
  return {
    id: `placement-${assetId}`, asset_id: assetId, ad_campaign_id: campaignId, campaign_key: campaignId,
    campaign_name_snapshot: "Campagne test", platform: "tiktok", product_id: "product-1",
    product_name_snapshot: "Produit test", variant_label: null, campaign_status_snapshot: "active",
    external_campaign_id: "native-campaign-1", external_ad_id: "native-ad-1",
    is_multi_media: false, asset_index: 0, ...overrides,
  };
}

function asset(id: string) {
  return {
    id, kind: "image", sha256: id.padEnd(64, "a").slice(0, 64), perceptual_hash: null,
    keyframe_hashes: [], source_url: `https://media.example/${id}`, delivery_url: `https://media.example/${id}`,
    file_size: 100, created_at: "2026-10-01T00:00:00.000Z",
  };
}

class QueryBuilder {
  constructor(private readonly rowsByTable: Record<string, unknown[]>, private readonly table: string, private readonly onUpsert?: (table: string) => void) {}
  select() { return this; }
  eq() { return this; }
  in() { return this; }
  gte() { return this; }
  lte() { return this; }
  not() { return this; }
  order() { return this; }
  range() { return this; }
  upsert() { this.onUpsert?.(this.table); return Promise.resolve({ error: null }); }
  then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
    return Promise.resolve({ data: this.rowsByTable[this.table] ?? [], error: null }).then(resolve, reject);
  }
}

function supabase(rowsByTable: Record<string, unknown[]>, onUpsert?: (table: string) => void) {
  return { from: (table: string) => new QueryBuilder(rowsByTable, table, onUpsert) };
}

function fixtures(overrides: Record<string, unknown[]> = {}) {
  return {
    ad_campaigns: [campaign()],
    creative_media_placements: [placement()],
    creative_media_assets: [asset("asset-1")],
    tiktok_ad_accounts: [{ id: "tiktok-account-1", tiktok_advertiser_id: "advertiser-1", tiktok_integration_id: "tiktok-integration-1", currency: "USD", is_active: true }],
    tiktok_integrations: [{ id: "tiktok-integration-1", access_token_encrypted: "encrypted", is_active: true }],
    pinterest_ad_accounts: [],
    pinterest_integrations: [],
    tiktok_campaign_mappings: [],
    creative_campaign_metric_snapshots: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchTikTokCampaignReport).mockResolvedValue([]);
  vi.mocked(fetchTikTokAdReport).mockResolvedValue([]);
  vi.mocked(fetchPinterestCampaignReport).mockResolvedValue([]);
  vi.mocked(fetchPinterestAdReport).mockResolvedValue([]);
});

describe("loadCreativePerformance provider flow", () => {
  it("shows actual Pinterest and TikTok ad reports on the exact creative, separately from campaign totals", async () => {
    vi.mocked(fetchTikTokCampaignReport).mockResolvedValue([
      { id: "native-campaign-1", name: "TikTok campaign", spend: 99, impressions: 900, clicks: 90, conversions: 9, cpa: 11 },
    ]);
    vi.mocked(fetchTikTokAdReport).mockResolvedValue([
      { id: "native-ad-1", name: "TikTok ad", spend: 17.25, impressions: 150, clicks: 14, conversions: 2, cpa: 8.625 },
    ]);
    vi.mocked(fetchPinterestCampaignReport).mockResolvedValue([
      { id: "p-campaign-1", name: "Pinterest campaign", spend: 88, impressions: 800, clicks: 80, conversions: 8, cpa: 11 },
    ]);
    vi.mocked(fetchPinterestAdReport).mockResolvedValue([
      { id: "p-ad-1", spend: 9.5, impressions: 70, clicks: 7, conversions: 1, cpa: 9.5 },
    ]);

    const rows = fixtures({
      ad_campaigns: [
        campaign(),
        campaign({ id: "campaign-pinterest", platform: "pinterest", external_campaign_id: "p-campaign-1", external_ad_id: "p-ad-1", tiktok_ad_account_id: null, pinterest_ad_account_id: "pinterest-account-1" }),
      ],
      creative_media_placements: [
        placement(),
        placement({ id: "placement-asset-pinterest", asset_id: "asset-pinterest", ad_campaign_id: "campaign-pinterest", campaign_key: "campaign-pinterest", platform: "pinterest", external_campaign_id: "p-campaign-1", external_ad_id: "p-ad-1" }),
      ],
      creative_media_assets: [asset("asset-1"), asset("asset-pinterest")],
      pinterest_ad_accounts: [{ id: "pinterest-account-1", pinterest_ad_account_id: "pinterest-ad-account", pinterest_integration_id: "pinterest-integration-1", currency: "USD", is_active: true }],
      pinterest_integrations: [{ id: "pinterest-integration-1", access_token_encrypted: "encrypted", is_active: true }],
    });

    const result = await loadCreativePerformance({ supabase: supabase(rows), userId: "user-1", storeId: "store-1", period });
    const tiktokCreative = result.media.find((item: any) => item.id === "asset-1")!.campaigns[0].metrics;
    const pinterestCreative = result.media.find((item: any) => item.id === "asset-pinterest")!.campaigns[0].metrics;

    expect(tiktokCreative).toMatchObject({ available: true, scope: "ad", currency: "USD", spend: 17.25, clicks: 14, platformConversions: 2, platformConversionValue: null });
    expect(pinterestCreative).toMatchObject({ available: true, scope: "ad", currency: "USD", spend: 9.5, clicks: 7, platformConversions: 1 });
    expect(result.campaigns.find((row: any) => row.campaignId === "campaign-1")?.metrics?.spend).toBe(99);
    expect(result.campaigns.find((row: any) => row.campaignId === "campaign-pinterest")?.metrics?.spend).toBe(88);
    expect(fetchTikTokCampaignReport).toHaveBeenCalledWith("advertiser-1", "access-token", period.from, period.to);
    expect(fetchTikTokAdReport).toHaveBeenCalledWith("advertiser-1", "access-token", period.from, period.to);
    expect(fetchPinterestCampaignReport).toHaveBeenCalledWith("pinterest-ad-account", "access-token", period.from, period.to);
    expect(fetchPinterestAdReport).toHaveBeenCalledWith("pinterest-ad-account", "access-token", ["p-ad-1"], period.from, period.to);
  });

  it("reads provider metrics without writing snapshots in read-only mode", async () => {
    vi.mocked(fetchTikTokCampaignReport).mockResolvedValue([
      { id: "native-campaign-1", name: "TikTok campaign", spend: 99, impressions: 900, clicks: 90, conversions: 9, cpa: 11 },
    ]);
    const onUpsert = vi.fn();
    const database = supabase(fixtures(), onUpsert);
    const result = await loadCreativePerformance({ supabase: database, userId: "user-1", storeId: "store-1", period, persistSnapshots: false });
    expect(result.campaigns[0].metrics?.spend).toBe(99);
    expect(onUpsert).not.toHaveBeenCalled();

    await loadCreativePerformance({ supabase: database, userId: "user-1", storeId: "store-1", period });
    expect(onUpsert).toHaveBeenCalledOnce();
    expect(onUpsert).toHaveBeenCalledWith("creative_campaign_metric_snapshots");
  });

  it("explains a missing TikTok connection and returns no invented metrics", async () => {
    const rows = fixtures({
      ad_campaigns: [campaign({ tiktok_ad_account_id: null })],
      tiktok_ad_accounts: [], tiktok_integrations: [],
    });
    const result = await loadCreativePerformance({ supabase: supabase(rows), userId: "user-1", storeId: "store-1", period });
    expect(result.notices.tikTok).toContain("Connecte TikTok Ads");
    expect(result.media[0].campaigns[0].metrics.available).toBe(false);
    expect(result.media[0].campaigns[0].metrics.spend).toBeNull();
    expect(fetchTikTokCampaignReport).not.toHaveBeenCalled();
    expect(fetchTikTokAdReport).not.toHaveBeenCalled();
  });

  it("keeps connected Pinterest campaigns empty when the provider returns no rows", async () => {
    const rows = fixtures({
      ad_campaigns: [campaign({ platform: "pinterest", external_campaign_id: "p-campaign-1", external_ad_id: "p-ad-1", tiktok_ad_account_id: null, pinterest_ad_account_id: "pinterest-account-1" })],
      creative_media_placements: [placement({ platform: "pinterest", external_campaign_id: "p-campaign-1", external_ad_id: "p-ad-1" })],
      pinterest_ad_accounts: [{ id: "pinterest-account-1", pinterest_ad_account_id: "pinterest-ad-account", pinterest_integration_id: "pinterest-integration-1", currency: "USD", is_active: true }],
      pinterest_integrations: [{ id: "pinterest-integration-1", access_token_encrypted: "encrypted", is_active: true }],
      tiktok_ad_accounts: [], tiktok_integrations: [],
    });
    const result = await loadCreativePerformance({ supabase: supabase(rows), userId: "user-1", storeId: "store-1", period });
    expect(result.media[0].campaigns[0].metrics).toMatchObject({ available: false, spend: null, clicks: null });
    expect(result.campaigns[0].metrics).toBeNull();
    expect(fetchPinterestCampaignReport).toHaveBeenCalledOnce();
    expect(fetchPinterestAdReport).toHaveBeenCalledOnce();
  });

  it("withholds an ad metric when the same external ad ID maps to two campaigns", async () => {
    vi.mocked(fetchTikTokAdReport).mockResolvedValue([
      { id: "native-ad-1", name: "Ambiguous ad", spend: 50, impressions: 500, clicks: 50, conversions: 5, cpa: 10 },
    ]);
    const rows = fixtures({
      ad_campaigns: [
        campaign(),
        campaign({ id: "campaign-2", product_id: "product-2", external_campaign_id: "native-campaign-2" }),
      ],
      creative_media_placements: [
        placement(),
        placement({ id: "placement-asset-2", asset_id: "asset-2", ad_campaign_id: "campaign-2", campaign_key: "campaign-2" }),
      ],
      creative_media_assets: [asset("asset-1"), asset("asset-2")],
    });
    const result = await loadCreativePerformance({ supabase: supabase(rows), userId: "user-1", storeId: "store-1", period });
    expect(result.media).toHaveLength(2);
    expect(result.media.every((item: any) => item.campaigns[0].metrics.available === false)).toBe(true);
    expect(result.media.every((item: any) => item.campaigns[0].metrics.spend === null)).toBe(true);
  });

  it("does not divide one campaign/ad result across multiple carousel assets", async () => {
    vi.mocked(fetchTikTokCampaignReport).mockResolvedValue([
      { id: "native-campaign-1", name: "TikTok campaign", spend: 99, impressions: 900, clicks: 90, conversions: 9, cpa: 11 },
    ]);
    vi.mocked(fetchTikTokAdReport).mockResolvedValue([
      { id: "native-ad-1", name: "TikTok ad", spend: 17.25, impressions: 150, clicks: 14, conversions: 2, cpa: 8.625 },
    ]);
    const rows = fixtures({
      creative_media_placements: [
        placement({ is_multi_media: true, asset_index: 0 }),
        placement({ id: "placement-asset-2", asset_id: "asset-2", is_multi_media: true, asset_index: 1 }),
      ],
      creative_media_assets: [asset("asset-1"), asset("asset-2")],
    });
    const result = await loadCreativePerformance({ supabase: supabase(rows), userId: "user-1", storeId: "store-1", period });
    expect(result.campaigns[0].metrics?.spend).toBe(99);
    expect(result.media.every((item: any) => item.campaigns[0].metrics.available === false)).toBe(true);
  });

  it("aggregates a reused asset once across campaigns when each ad is uniquely identified", async () => {
    vi.mocked(fetchTikTokAdReport).mockResolvedValue([
      { id: "native-ad-1", name: "TikTok ad 1", spend: 17.25, impressions: 150, clicks: 14, conversions: 2, cpa: 8.625 },
      { id: "native-ad-2", name: "TikTok ad 2", spend: 8.5, impressions: 90, clicks: 9, conversions: 1, cpa: 8.5 },
    ]);
    const rows = fixtures({
      ad_campaigns: [
        campaign(),
        campaign({ id: "campaign-2", title: "Campagne 2", external_campaign_id: "native-campaign-2", external_ad_id: "native-ad-2" }),
      ],
      creative_media_placements: [
        placement(),
        placement({ id: "placement-asset-reused", ad_campaign_id: "campaign-2", campaign_key: "campaign-2", campaign_name_snapshot: "Campagne 2", external_campaign_id: "native-campaign-2", external_ad_id: "native-ad-2" }),
      ],
      creative_media_assets: [asset("asset-1")],
    });

    const result = await loadCreativePerformance({ supabase: supabase(rows), userId: "user-1", storeId: "store-1", period });

    expect(result.media).toHaveLength(1);
    expect(result.media[0]).toMatchObject({
      id: "asset-1", spend: 25.75, spendByCurrency: [{ currency: "USD", amount: 25.75 }],
      clicks: 23, metricsComplete: true, winner: false,
    });
    expect(result.media[0].campaigns.map((row: any) => row.campaignId)).toEqual(["campaign-1", "campaign-2"]);
    expect(fetchTikTokAdReport).toHaveBeenCalledWith("advertiser-1", "access-token", period.from, period.to);
  });

  it("marks reused-asset totals partial when one campaign has no creative-level report", async () => {
    vi.mocked(fetchTikTokAdReport).mockResolvedValue([
      { id: "native-ad-1", name: "TikTok ad 1", spend: 17.25, impressions: 150, clicks: 14, conversions: 2, cpa: 8.625 },
    ]);
    const rows = fixtures({
      ad_campaigns: [
        campaign(),
        campaign({ id: "campaign-2", title: "Campagne 2", external_campaign_id: "native-campaign-2", external_ad_id: "native-ad-2" }),
      ],
      creative_media_placements: [
        placement(),
        placement({ id: "placement-asset-reused", ad_campaign_id: "campaign-2", campaign_key: "campaign-2", campaign_name_snapshot: "Campagne 2", external_campaign_id: "native-campaign-2", external_ad_id: "native-ad-2" }),
      ],
      creative_media_assets: [asset("asset-1")],
    });

    const result = await loadCreativePerformance({ supabase: supabase(rows), userId: "user-1", storeId: "store-1", period });

    expect(result.media).toHaveLength(1);
    expect(result.media[0]).toMatchObject({
      spend: null, spendByCurrency: [{ currency: "USD", amount: 17.25 }], clicks: null,
      attributedOrders: null, attributedRevenue: null, metricsComplete: false, winner: false,
    });
  });
});
