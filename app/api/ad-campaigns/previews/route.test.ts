import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, prepareImage, prepareVideo } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  prepareImage: vi.fn(),
  prepareVideo: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser }));
vi.mock("@/lib/crypto", () => ({ decryptSecret: () => "account-access-token" }));
vi.mock("@/lib/meta/api", () => ({ META_GRAPH_BASE_URL: "https://graph.facebook.com/v22.0" }));
vi.mock("@/lib/meta/ad-image", () => ({ prepareMetaCreativeImage: prepareImage }));
vi.mock("@/lib/meta/ad-video", () => ({
  isVideoMediaUrl: (url: string) => /\/video\/upload\/|\.(mp4|mov|m4v|webm)(?:$|\?)/i.test(url),
  prepareMetaCreativeVideo: prepareVideo,
}));
vi.mock("@/lib/meta/cta", () => ({
  LEGACY_META_CTA: "LEARN_MORE",
  normalizeMetaCta: (value: unknown) => typeof value === "string" ? value : null,
}));

import { POST } from "./route";

const request = (body: Record<string, unknown>) => new Request("http://localhost/api/ad-campaigns/previews", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function setupAccount() {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn().mockResolvedValue({
    data: { id: "account-row-1", meta_account_id: "123", access_token_encrypted: "encrypted-token" },
    error: null,
  });
  const from = vi.fn(() => query);
  requireUser.mockResolvedValue({ supabase: { from }, user: { id: "user-1" }, response: null });
  return from;
}

function successfulPreviewFetch() {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [{ body: "<iframe src=\"https://www.facebook.com/preview\"></iframe>" }] }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Real network forbidden in preview tests"); }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("Meta video previews", () => {
  it("prepares a video as a video and returns its Meta id and thumbnail", async () => {
    const from = setupAccount();
    prepareVideo.mockResolvedValue({ videoId: "meta-video-1", thumbnailUrl: "https://cdn.example/thumb.jpg" });

    const response = await POST(request({
      meta_ad_account_id: "account-row-1",
      image_url: "https://cdn.example/video.mp4",
      prepare_only: true,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ video_id: "meta-video-1", video_thumbnail_url: "https://cdn.example/thumb.jpg" });
    expect(from).toHaveBeenCalledWith("meta_ad_accounts");
    expect(prepareVideo).toHaveBeenCalledWith({
      accountId: "act_123",
      accessToken: "account-access-token",
      videoUrl: "https://cdn.example/video.mp4",
    });
    expect(prepareImage).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends video_data with the video ID and thumbnail, never link_data.picture", async () => {
    setupAccount();
    const fetchMock = successfulPreviewFetch();

    const response = await POST(request({
      meta_ad_account_id: "account-row-1",
      meta_page_id: "page-1",
      placement: "auto",
      format: "MOBILE_FEED_STANDARD",
      link: "https://shop.example/product",
      image_url: "https://cdn.example/video.mp4",
      video_id: "meta-video-1",
      video_thumbnail_url: "https://cdn.example/thumb.jpg",
      message: "Texte de la publicité",
      headline: "Titre vidéo",
      call_to_action: "LEARN_MORE",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      preview: { id: "MOBILE_FEED_STANDARD", html: expect.stringContaining("iframe") },
      video_id: "meta-video-1",
      video_thumbnail_url: "https://cdn.example/thumb.jpg",
    });
    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const creative = JSON.parse(requestUrl.searchParams.get("creative") ?? "{}");
    expect(creative.object_story_spec).toMatchObject({
      page_id: "page-1",
      video_data: {
        video_id: "meta-video-1",
        image_url: "https://cdn.example/thumb.jpg",
        message: "Texte de la publicité",
        title: "Titre vidéo",
        call_to_action: { type: "LEARN_MORE", value: { link: "https://shop.example/product" } },
      },
    });
    expect(creative.object_story_spec.link_data).toBeUndefined();
    expect(prepareVideo).not.toHaveBeenCalled();
    expect(prepareImage).not.toHaveBeenCalled();
  });

  it("prepares a video on demand with a bounded wait if the wizard has no cached video yet", async () => {
    setupAccount();
    const fetchMock = successfulPreviewFetch();
    prepareVideo.mockResolvedValue({ videoId: "meta-video-2", thumbnailUrl: "https://cdn.example/thumb-2.jpg" });

    const response = await POST(request({
      meta_ad_account_id: "account-row-1",
      meta_page_id: "page-1",
      placement: "auto",
      format: "MOBILE_FEED_STANDARD",
      link: "https://shop.example/product",
      image_url: "https://cdn.example/video.mp4",
    }));

    expect(response.status).toBe(200);
    expect(prepareVideo).toHaveBeenCalledWith({
      accountId: "act_123",
      accessToken: "account-access-token",
      videoUrl: "https://cdn.example/video.mp4",
      timeoutMs: 35_000,
    });
    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const creative = JSON.parse(requestUrl.searchParams.get("creative") ?? "{}");
    expect(creative.object_story_spec.video_data).toMatchObject({ video_id: "meta-video-2", image_url: "https://cdn.example/thumb-2.jpg" });
    expect(prepareImage).not.toHaveBeenCalled();
  });

  it("keeps the image preview path unchanged", async () => {
    setupAccount();
    const fetchMock = successfulPreviewFetch();
    prepareImage.mockResolvedValue({ imageHash: "image-hash-1234" });

    const response = await POST(request({
      meta_ad_account_id: "account-row-1",
      meta_page_id: "page-1",
      placement: "auto",
      format: "MOBILE_FEED_STANDARD",
      link: "https://shop.example/product",
      image_url: "https://cdn.example/image.jpg",
      message: "Texte",
      headline: "Titre",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ image_hash: "image-hash-1234" });
    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const creative = JSON.parse(requestUrl.searchParams.get("creative") ?? "{}");
    expect(creative.object_story_spec.link_data).toMatchObject({ image_hash: "image-hash-1234" });
    expect(creative.object_story_spec.video_data).toBeUndefined();
    expect(prepareVideo).not.toHaveBeenCalled();
  });
});
