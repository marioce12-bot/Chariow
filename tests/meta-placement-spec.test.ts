import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPlacementCreativeParams, FEED_LABEL, VERTICAL_LABEL, placementVariantsEnabled } from "@/lib/meta/placement-spec";
import { createMetaCreative } from "@/lib/meta/campaigns";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("buildPlacementCreativeParams", () => {
  const params = buildPlacementCreativeParams({ pageId: "p1", link: "https://boutique.exemple/prd_1", message: "Texte", headline: "Titre", feedHash: "hFeed", verticalHash: "hVert" });
  const spec = JSON.parse(params.asset_feed_spec);

  it("envoie les deux images avec leur étiquette", () => {
    expect(spec.images).toEqual([
      { hash: "hFeed", adlabels: [{ name: FEED_LABEL }] },
      { hash: "hVert", adlabels: [{ name: VERTICAL_LABEL }] },
    ]);
    expect(JSON.parse(params.object_story_spec)).toEqual({ page_id: "p1" });
  });

  it("affecte le 9:16 aux Stories/Reels et le 4:5 aux fils d'actualité", () => {
    const [vertical, feed] = spec.asset_customization_rules;
    expect(vertical.image_label.name).toBe(VERTICAL_LABEL);
    expect(vertical.customization_spec.instagram_positions).toEqual(["story", "reels"]);
    expect(vertical.customization_spec.facebook_positions).toContain("story");
    expect(feed.image_label.name).toBe(FEED_LABEL);
    expect(feed.customization_spec.facebook_positions).toContain("feed");
    expect(feed.customization_spec.instagram_positions).toContain("stream");
  });

  it("reprend texte, titre et lien", () => {
    expect(spec.bodies).toEqual([{ text: "Texte" }]);
    expect(spec.titles).toEqual([{ text: "Titre" }]);
    expect(spec.link_urls).toEqual([{ website_url: "https://boutique.exemple/prd_1" }]);
  });
});

describe("placementVariantsEnabled", () => {
  it("est désactivé par défaut et s'active avec META_PLACEMENT_VARIANTS=1", () => {
    vi.stubEnv("META_PLACEMENT_VARIANTS", "");
    expect(placementVariantsEnabled()).toBe(false);
    vi.stubEnv("META_PLACEMENT_VARIANTS", "1");
    expect(placementVariantsEnabled()).toBe(true);
  });
});

describe("createMetaCreative avec variantes par placement", () => {
  const cloudinaryUrl = "https://res.cloudinary.com/democloud/image/upload/v1/vendeo/campaign-creatives/a.jpg";
  const base = { accountId: "act_1", accessToken: "tok", name: "Créative", pageId: "p1", link: "https://boutique.exemple/prd_1", message: "Texte", headline: "Titre", imageUrl: cloudinaryUrl };

  it("reste sur l'image unique quand l'option n'est pas activée (aucune image téléchargée)", async () => {
    vi.stubEnv("META_PLACEMENT_VARIANTS", "");
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "democloud");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "cr_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createMetaCreative({ ...base, imageHash: "h1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = new URLSearchParams(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(sent.get("asset_feed_spec")).toBeNull();
    expect(JSON.parse(sent.get("object_story_spec") as string).link_data.image_hash).toBe("h1");
  });

  it("retombe sur l'image unique quand une variante est illisible", async () => {
    vi.stubEnv("META_PLACEMENT_VARIANTS", "1");
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "democloud");
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("res.cloudinary.com")) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify({ id: "cr_1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await createMetaCreative({ ...base, imageHash: "h1" });
    const metaCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("adcreatives"));
    expect(metaCalls).toHaveLength(1);
    const sent = new URLSearchParams(String((metaCalls[0][1] as RequestInit).body));
    expect(sent.get("asset_feed_spec")).toBeNull();
    expect(JSON.parse(sent.get("object_story_spec") as string).link_data.image_hash).toBe("h1");
  });
});
