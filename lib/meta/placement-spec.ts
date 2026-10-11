// Créative Meta « par placement » : une image 4:5 pour les fils d'actualité, une image 9:16 pour les
// Stories et Reels (Placement Asset Customization, via asset_feed_spec).
//
// Opt-in : activé uniquement si META_PLACEMENT_VARIANTS=1. createMetaCreative retombe sur la créative
// à image unique si Meta refuse ce format, pour ne jamais bloquer un lancement.

export const FEED_LABEL = "vendeo_feed";
export const VERTICAL_LABEL = "vendeo_vertical";

export type PlacementCreativeInput = {
  pageId: string;
  link: string;
  message: string;
  headline: string;
  feedHash: string;
  verticalHash: string;
};

export function placementVariantsEnabled(): boolean {
  return process.env.META_PLACEMENT_VARIANTS === "1";
}

export function buildPlacementCreativeParams(input: PlacementCreativeInput): { object_story_spec: string; asset_feed_spec: string } {
  const assetFeedSpec = {
    images: [
      { hash: input.feedHash, adlabels: [{ name: FEED_LABEL }] },
      { hash: input.verticalHash, adlabels: [{ name: VERTICAL_LABEL }] },
    ],
    bodies: [{ text: input.message }],
    titles: [{ text: input.headline }],
    link_urls: [{ website_url: input.link }],
    call_to_action_types: ["LEARN_MORE"],
    ad_formats: ["SINGLE_IMAGE"],
    optimization_type: "PLACEMENT",
    asset_customization_rules: [
      {
        customization_spec: {
          publisher_platforms: ["facebook", "instagram"],
          facebook_positions: ["story", "facebook_reels"],
          instagram_positions: ["story", "reels"],
        },
        image_label: { name: VERTICAL_LABEL },
        priority: 1,
      },
      {
        customization_spec: {
          publisher_platforms: ["facebook", "instagram"],
          facebook_positions: ["feed", "video_feeds", "marketplace", "search"],
          instagram_positions: ["stream", "explore", "explore_home", "profile_feed"],
        },
        image_label: { name: FEED_LABEL },
        priority: 2,
      },
    ],
  };
  return {
    object_story_spec: JSON.stringify({ page_id: input.pageId }),
    asset_feed_spec: JSON.stringify(assetFeedSpec),
  };
}
