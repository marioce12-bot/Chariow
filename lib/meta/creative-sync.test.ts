import { afterEach, describe, expect, it, vi } from "vitest";
import { getMetaCreativePatch } from "./creative-sync";
const input = { adId: "ad-1", accessToken: "test-token", campaign: { external_creative_id: "old", media_url: "https://cdn.example/old.jpg", carousel_urls: ["https://cdn.example/old2.jpg"] } };
function mockCreative(creative: unknown) {
  return vi.stubGlobal("fetch", vi.fn(async () => Response.json({ creative })));
}
afterEach(() => vi.unstubAllGlobals());
describe("read-only Meta creative synchronization", () => {
  it("reads the current creative and replaces the old visual without stale carousel cards", async () => {
    mockCreative({ id: "new", image_url: "https://cdn.example/new.jpg" });
    expect(await getMetaCreativePatch(input)).toEqual({ external_creative_id: "new", media_url: "https://cdn.example/new.jpg", carousel_urls: [] });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(new URL(String(url)).pathname).toMatch(/\/ad-1$/);
    expect(options).toMatchObject({ cache: "no-store" });
    expect(options?.method).toBeUndefined();
  });
  it("refreshes the media even when the creative ID did not change", async () => {
    mockCreative({ id: "old", object_story_spec: { link_data: { picture: "https://cdn.example/new.jpg" } } });
    expect(await getMetaCreativePatch(input)).toMatchObject({ media_url: "https://cdn.example/new.jpg" });
  });
  it("preserves the order of all carousel cards", async () => {
    mockCreative({ id: "new", object_story_spec: { link_data: { child_attachments: [{ picture: "https://cdn.example/a.jpg" }, { picture: "https://cdn.example/b.jpg" }] } } });
    expect(await getMetaCreativePatch(input)).toEqual({ external_creative_id: "new", media_url: "https://cdn.example/a.jpg", carousel_urls: ["https://cdn.example/b.jpg"] });
  });
  it("does not overwrite local media with a partial carousel", async () => {
    mockCreative({ id: "new", object_story_spec: { link_data: { child_attachments: [{ picture: "https://cdn.example/a.jpg" }, {}] } } });
    expect(await getMetaCreativePatch(input)).toEqual({});
  });
  it("uses a playable video source rather than a thumbnail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ creative: { id: "new", object_story_spec: { video_data: { video_id: "video-1", image_url: "https://cdn.example/poster.jpg" } } } })).mockResolvedValueOnce(Response.json({ source: "https://cdn.example/new.mp4" })));
    expect(await getMetaCreativePatch(input)).toMatchObject({ media_url: "https://cdn.example/new.mp4" });
  });
  it.each([{ id: "new", thumbnail_url: "https://cdn.example/tiny.jpg" }, { id: "new", image_url: "javascript:alert(1)" }, { id: "new", asset_feed_spec: { videos: [{ video_id: "v" }] } }])("keeps existing media for unsupported/unsafe content: %j", async (creative) => {
    mockCreative(creative);
    expect(await getMetaCreativePatch(input)).toEqual({});
  });
  it("does not write when the creative is unchanged", async () => {
    mockCreative({ id: "old", image_url: input.campaign.media_url });
    expect(await getMetaCreativePatch({ ...input, campaign: { ...input.campaign, carousel_urls: [] } })).toEqual({});
  });
  it("keeps local media on network, permission and malformed-response failures", async () => {
    for (const response of [Response.json({ error: { code: 200, message: "Permission denied" } }, { status: 403 }), new Response("not json")]) {
      vi.stubGlobal("fetch", vi.fn(async () => response));
      expect(await getMetaCreativePatch(input)).toEqual({});
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await getMetaCreativePatch(input)).toEqual({});
  });
  it("surfaces an explicit invalid-token response for reconnect handling", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: { code: 190, message: "OAuth token expired" } }, { status: 400 })));
    await expect(getMetaCreativePatch(input)).rejects.toMatchObject({ name: "MetaAuthenticationError", code: 190 });
  });
});
