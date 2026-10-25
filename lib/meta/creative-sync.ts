import { META_GRAPH_BASE_URL } from "./api";
import { createMetaGraphError, fetchMetaGraph, isMetaAuthenticationError } from "./graph";

type CreativeRow = { external_creative_id?: string | null; media_url?: string | null; carousel_urls?: string[] | null };
type CreativePatch = { external_creative_id?: string; media_url?: string; carousel_urls?: string[] };

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { return new URL(value).protocol === "https:" ? value : null; } catch { return null; }
}

async function graphRead(path: string, fields: string, accessToken: string) {
  const url = new URL(`${META_GRAPH_BASE_URL}/${encodeURIComponent(path)}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);
  const response = await fetchMetaGraph(url, { signal: AbortSignal.timeout(10_000) });
  const json = await response.json();
  if (!response.ok || json.error) throw createMetaGraphError(json.error, response.status, "Meta creative read unavailable");
  return json;
}

/** Read-only reconciliation. A failed/partial creative read never erases local media. */
export async function getMetaCreativePatch(input: { adId: string; accessToken: string; campaign: CreativeRow }): Promise<CreativePatch> {
  try {
    const ad = await graphRead(input.adId, "creative{id,image_url,thumbnail_url,object_story_spec,asset_feed_spec}", input.accessToken);
    const creative = ad.creative;
    if (!creative || typeof creative.id !== "string") return {};
    const story = creative.object_story_spec;
    const link = story?.link_data;
    const cards = Array.isArray(link?.child_attachments) ? link.child_attachments : [];
    const video = story?.video_data;
    let mediaUrl: string | null = null;
    let carouselUrls: string[] = [];
    if (video?.video_id) {
      // A poster is not a playable video: never replace a video with its thumbnail.
      const asset = await graphRead(String(video.video_id), "source", input.accessToken);
      mediaUrl = httpsUrl(asset.source);
    } else if (cards.length) {
      const urls = cards.map((card: any) => httpsUrl(card.picture));
      // Do not store a partial carousel or silently drop an unreadable card.
      if (urls.some((url: string | null) => !url)) return {};
      mediaUrl = urls[0];
      carouselUrls = urls.slice(1);
    } else {
      // Dynamic video assets need their actual source, not a still-image fallback.
      if (creative.asset_feed_spec?.videos?.length) return {};
      mediaUrl = httpsUrl(creative.image_url) ?? httpsUrl(link?.picture)
        ?? httpsUrl(creative.asset_feed_spec?.images?.[0]?.url);
    }
    if (!mediaUrl) return {};
    const patch: CreativePatch = {};
    if (creative.id !== input.campaign.external_creative_id) patch.external_creative_id = creative.id;
    if (mediaUrl !== input.campaign.media_url) patch.media_url = mediaUrl;
    if (JSON.stringify(carouselUrls) !== JSON.stringify(input.campaign.carousel_urls ?? [])) patch.carousel_urls = carouselUrls;
    return patch;
  } catch (error) {
    // Status verification remains independent of creative permissions/network failures.
    if (isMetaAuthenticationError(error)) throw error;
    return {};
  }
}
