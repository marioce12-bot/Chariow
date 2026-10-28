import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, provider, pageToken, createCampaign, createAdSet, createCreative, createCarousel, createVideo, prepareVideo, createAd, publishAd, funding, fundingIssue, prepareImage } = vi.hoisted(() => ({
  requireUser: vi.fn(), provider: vi.fn(), pageToken: vi.fn(), createCampaign: vi.fn(), createAdSet: vi.fn(), createCreative: vi.fn(), createCarousel: vi.fn(), createVideo: vi.fn(), prepareVideo: vi.fn(), createAd: vi.fn(), publishAd: vi.fn(), funding: vi.fn(), fundingIssue: vi.fn(), prepareImage: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "account-access-token" }));
vi.mock("@/lib/meta/campaigns", () => ({
  activateMetaCampaign: provider, createMetaAd: createAd, createMetaAdSet: createAdSet,
  createMetaCampaign: createCampaign, createMetaCarouselCreative: createCarousel,
  createMetaCreative: createCreative, publishMetaAdWithAdvantage: publishAd,
  updateMetaAdCreative: provider,
}));
vi.mock("@/lib/meta/api", () => ({ fetchMetaPageAccessToken: pageToken, getMetaAccountFunding: funding, describeMetaFundingIssue: fundingIssue }));
vi.mock("@/lib/meta/ad-image", () => ({ prepareMetaCreativeImage: prepareImage }));
vi.mock("@/lib/meta/ad-video", () => ({ createMetaVideoCreative: createVideo, isVideoMediaUrl: (url: string) => url.endsWith(".mp4"), prepareMetaCreativeVideo: prepareVideo }));
vi.mock("@/lib/meta/carousel", () => ({ parseCarouselUrls: (urls: unknown) => Array.isArray(urls) ? urls : [] }));
vi.mock("@/lib/meta/tracking", () => ({ withVendeoCampaignTracking: (url: string) => url }));
vi.mock("@/lib/tiktok/launch", () => ({ launchTikTok: provider }));
vi.mock("@/lib/plans", () => ({ metaPublisherPlatforms: () => ["facebook", "instagram", "threads", "messenger", "audience_network", "whatsapp"], isPlanId: () => false }));
vi.mock("@/lib/pinterest/api", () => ({ launchPinterest: provider }));
vi.mock("@/lib/pinterest/tag-help", () => ({ PINTEREST_TAG_REQUIRED_CODE: "tag", isPinterestConversionTagError: () => false, pinterestTagShortMessage: () => "" }));
vi.mock("@/lib/meta/pixel-help", () => ({ META_PIXEL_REQUIRED_CODE: "META_PIXEL_REQUIRED_FOR_SALES" }));

import { POST } from "./route";

const request = (body: Record<string, unknown> = {}) => new Request("http://localhost/api/ad-campaigns/campaign-1/launch", { method: "POST", body: JSON.stringify(body) });
const context = () => ({ params: Promise.resolve({ id: "campaign-1" }) });

beforeEach(() => {
  vi.resetAllMocks();
  // Any accidental real HTTP request must fail: all launch providers below are mocked.
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Real network forbidden in launch tests"); }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("preview launch guard", () => {
  it("blocks campaign publication before reading campaign data or calling providers", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const from = vi.fn(() => { throw new Error("Campaign data must not be read in Preview"); });
    requireUser.mockResolvedValue({ supabase: { from }, user: { id: "user-1" }, response: null });

    const response = await POST(request(), context());

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("désactivé sur cette Preview") });
    expect(from).not.toHaveBeenCalled();
    for (const mock of [provider, pageToken, createCampaign, createAdSet, createCreative, createCarousel, createVideo, prepareVideo, createAd, publishAd, funding, prepareImage]) expect(mock).not.toHaveBeenCalled();
  });
});

describe("launch lifecycle guard", () => {
  it("returns 409 for a legacy archived row without invoking any provider", async () => {
    const query: any = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: {
        id: "campaign-1", platform: "meta", status: "paused",
        external_error: "META_PAUSED:Meta indique que la publicité ou son ensemble/campagne est archived. L’historique est conservé.",
        media_url: "https://example.invalid/image.png",
      }, error: null }),
    };
    requireUser.mockResolvedValue({ supabase: { from: () => query }, user: { id: "user-1" }, response: null });
    expect((await POST(request(), context())).status).toBe(409);
    for (const mock of [provider, pageToken, createCampaign, createAdSet, createCreative, createCarousel, createVideo, prepareVideo, createAd, publishAd, funding, prepareImage]) expect(mock).not.toHaveBeenCalled();
  });
});

function setupDraft(overrides: Record<string, unknown> = {}) {
  const campaign = {
    id: "campaign-1", platform: "meta", status: "draft", external_error: null,
    media_url: "https://example.invalid/image.png", meta_ad_account_id: "account-1", meta_page_id: "page-1",
    title: "Test campaign", ad_text: "Test copy", destination_url: "https://example.invalid/product",
    objective: "traffic", daily_budget: 2, duration_days: 3, countries: ["BJ"], min_age: 18, max_age: 65,
    ...overrides,
  };
  const from = vi.fn((table: string) => {
    let writing = false;
    const query: any = {};
    for (const method of ["select", "eq", "order"]) query[method] = vi.fn(() => query);
    query.update = vi.fn(() => { writing = true; return query; });
    query.upsert = vi.fn().mockResolvedValue({ error: null });
    query.limit = vi.fn().mockResolvedValue({ data: [], error: null });
    query.maybeSingle = vi.fn().mockImplementation(async () => ({ data:
      table === "ad_campaigns" ? campaign : table === "meta_ad_accounts" ? { id: "account-1", meta_account_id: "123", is_active: true, access_token_encrypted: "encrypted-test-token" } : { plan: "starter" }, error: null,
    }));
    query.single = vi.fn().mockImplementation(async () => ({ data: writing ? { id: campaign.id, status: "review" } : campaign, error: null }));
    return query;
  });
  requireUser.mockResolvedValue({ user: { id: "user-1" }, supabase: { from } });
  pageToken.mockRejectedValue(new Error("Page token unavailable: this must never be requested"));
  funding.mockResolvedValue({ accountStatus: 1, hasFundingSource: true });
  fundingIssue.mockReturnValue(null);
  createCampaign.mockResolvedValue({ id: "meta-campaign-1", objective: "OUTCOME_TRAFFIC" });
  createAdSet.mockResolvedValue({ id: "adset-1" });
  createCreative.mockResolvedValue({ id: "creative-1" });
  createCarousel.mockResolvedValue({ id: "carousel-1" });
  createVideo.mockResolvedValue({ id: "video-creative-1" });
  prepareVideo.mockResolvedValue({ videoId: "video-1", thumbnailUrl: "https://example.invalid/thumb.png" });
  createAd.mockResolvedValue({ id: "ad-1" });
  publishAd.mockResolvedValue({ id: "ad-1" });
  prepareImage.mockResolvedValue({ imageHash: "image-hash" });
}

describe("Meta launch without Page-token dependency (mock providers only)", () => {
  it("blocks a Sales campaign without a pixel before any provider call until Traffic is explicitly confirmed", async () => {
    setupDraft({ objective: "sales" });

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "META_PIXEL_REQUIRED_FOR_SALES", fallback_available: true });
    expect(funding).not.toHaveBeenCalled();
    for (const mock of [provider, createCampaign, createAdSet, createCreative, createAd, publishAd]) expect(mock).not.toHaveBeenCalled();
  });

  it("uses Traffic only after an explicit fallback confirmation", async () => {
    setupDraft({ objective: "sales" });

    const response = await POST(request({ confirm_traffic_fallback: true }), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ effective_objective: "traffic", objective_fallback: true });
    expect(createCampaign).toHaveBeenCalledWith(expect.objectContaining({ objective: "traffic", dailyBudget: 2 }));
  });

  it.each([
    ["image", {}, createCreative],
    ["carousel", { carousel_urls: ["https://example.invalid/second.png"] }, createCarousel],
    ["video", { media_url: "https://example.invalid/video.mp4" }, createVideo],
  ] as const)("prepares a %s creative using the account token and selected Page id", async (_kind, overrides, creative) => {
    setupDraft(overrides);
    const response = await POST(request(), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ campaign: { status: "review" } });
    expect(pageToken).not.toHaveBeenCalled();
    expect(createCampaign).toHaveBeenCalledWith(expect.objectContaining({ accountId: "act_123", accessToken: "account-access-token" }));
    expect(createAdSet).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "account-access-token",
      publisherPlatforms: ["facebook", "instagram", "threads", "messenger", "audience_network", "whatsapp"],
    }));
    expect(creative).toHaveBeenCalledWith(expect.objectContaining({ accountId: "act_123", accessToken: "account-access-token", pageId: "page-1" }));
    expect(createAd).toHaveBeenCalledWith(expect.objectContaining({ status: "ACTIVE" }));
    expect(publishAd).not.toHaveBeenCalled();
    if (_kind === "image") expect(createCreative).toHaveBeenCalledWith(expect.objectContaining({ advantageCreative: false }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still requires a selected Page before creating any Meta object", async () => {
    setupDraft({ meta_page_id: null });
    const response = await POST(request(), context());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Sélectionne une page Facebook avant de lancer la campagne" });
    expect(pageToken).not.toHaveBeenCalled();
    expect(createCampaign).not.toHaveBeenCalled();
    expect(createCreative).not.toHaveBeenCalled();
  });
});
