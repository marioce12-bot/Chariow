import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, provider } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  provider: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/meta/campaigns", () => ({
  activateMetaCampaign: provider, createMetaAd: provider, createMetaAdSet: provider,
  createMetaCampaign: provider, createMetaCarouselCreative: provider,
  createMetaCreative: provider, publishMetaAdWithAdvantage: provider,
  updateMetaAdCreative: provider,
}));
vi.mock("@/lib/meta/api", () => ({ fetchMetaPageAccessToken: provider, getMetaAccountFunding: provider, describeMetaFundingIssue: provider }));
vi.mock("@/lib/meta/ad-image", () => ({ prepareMetaCreativeImage: provider }));
vi.mock("@/lib/meta/ad-video", () => ({ createMetaVideoCreative: provider, isVideoMediaUrl: () => false, prepareMetaCreativeVideo: provider }));
vi.mock("@/lib/meta/carousel", () => ({ parseCarouselUrls: () => [] }));
vi.mock("@/lib/meta/tracking", () => ({ withVendeoCampaignTracking: (url: string) => url }));
vi.mock("@/lib/tiktok/launch", () => ({ launchTikTok: provider }));
vi.mock("@/lib/plans", () => ({ metaPublisherPlatforms: () => [], isPlanId: () => false }));
vi.mock("@/lib/pinterest/api", () => ({ launchPinterest: provider }));
vi.mock("@/lib/pinterest/tag-help", () => ({ PINTEREST_TAG_REQUIRED_CODE: "tag", isPinterestConversionTagError: () => false, pinterestTagShortMessage: () => "" }));

import { POST } from "./route";

describe("launch lifecycle guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it("returns 409 for a legacy archived row without invoking any provider", async () => {
    const response = await POST(new Request("http://localhost/api/ad-campaigns/campaign-1/launch", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "campaign-1" }) });
    expect(response.status).toBe(409);
    expect(provider).not.toHaveBeenCalled();
  });
});
