import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_META_CTA, LEGACY_META_CTA, META_CTA_TYPES, normalizeMetaCta } from "@/lib/meta/cta";
import { buildPlacementCreativeParams } from "@/lib/meta/placement-spec";
import { createMetaAdSet, createMetaCreative } from "@/lib/meta/campaigns";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeMetaCta", () => {
  it("accepte les types de la liste et rejette le reste", () => {
    for (const type of META_CTA_TYPES) expect(normalizeMetaCta(type)).toBe(type);
    expect(normalizeMetaCta("WHATSAPP_MESSAGE")).toBeNull();
    expect(normalizeMetaCta("shop_now")).toBeNull();
    expect(normalizeMetaCta(undefined)).toBeNull();
    expect(normalizeMetaCta(42)).toBeNull();
  });

  it("propose Acheter par défaut et garde LEARN_MORE pour les anciennes campagnes", () => {
    expect(DEFAULT_META_CTA).toBe("SHOP_NOW");
    expect(LEGACY_META_CTA).toBe("LEARN_MORE");
  });
});

describe("buildPlacementCreativeParams — bouton", () => {
  const base = { pageId: "p1", link: "https://boutique.exemple/prd_1", message: "Texte", headline: "Titre", feedHash: "hFeed", verticalHash: "hVert" };

  it("utilise le bouton demandé", () => {
    const spec = JSON.parse(buildPlacementCreativeParams({ ...base, callToAction: "ORDER_NOW" }).asset_feed_spec);
    expect(spec.call_to_action_types).toEqual(["ORDER_NOW"]);
  });

  it("retombe sur LEARN_MORE sans bouton", () => {
    const spec = JSON.parse(buildPlacementCreativeParams(base).asset_feed_spec);
    expect(spec.call_to_action_types).toEqual(["LEARN_MORE"]);
  });
});

describe("createMetaCreative — bouton et Advantage+", () => {
  const base = { accountId: "act_1", accessToken: "tok", name: "Créative", pageId: "p1", link: "https://boutique.exemple/prd_1", message: "Texte", headline: "Titre", imageUrl: "https://exemple.com/a.jpg" };

  function stubGraph() {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "cr_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function sentParams(fetchMock: ReturnType<typeof stubGraph>) {
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    return new URLSearchParams(String(init.body));
  }

  it("envoie le bouton choisi dans object_story_spec", async () => {
    const fetchMock = stubGraph();
    await createMetaCreative({ ...base, callToAction: "SHOP_NOW" });
    const spec = JSON.parse(sentParams(fetchMock).get("object_story_spec") ?? "{}");
    expect(spec.link_data.call_to_action).toEqual({ type: "SHOP_NOW", value: { link: base.link } });
  });

  it("garde LEARN_MORE quand aucun bouton valide n'est fourni", async () => {
    const fetchMock = stubGraph();
    await createMetaCreative({ ...base, callToAction: "NOPE" });
    const spec = JSON.parse(sentParams(fetchMock).get("object_story_spec") ?? "{}");
    expect(spec.link_data.call_to_action.type).toBe("LEARN_MORE");
  });

  it("active Advantage+ créative quand demandé", async () => {
    const fetchMock = stubGraph();
    await createMetaCreative({ ...base, advantageCreative: true });
    const dof = JSON.parse(sentParams(fetchMock).get("degrees_of_freedom_spec") ?? "{}");
    expect(Object.keys(dof.creative_features_spec)).toEqual(["image_touchups", "text_optimizations", "image_templates"]);
    expect(dof.creative_features_spec.image_touchups).toEqual({ enroll_status: "OPT_IN" });
  });

  it("n'active pas Advantage+ créative par défaut", async () => {
    const fetchMock = stubGraph();
    await createMetaCreative(base);
    expect(sentParams(fetchMock).get("degrees_of_freedom_spec")).toBeNull();
  });
});

describe("createMetaAdSet — audience Advantage+", () => {
  const base = { accountId: "act_1", accessToken: "tok", campaignId: "c1", name: "Audience", dailyBudget: 5, countries: ["BJ"], minAge: 18, maxAge: 45, advertiserName: "Boutique" };

  async function sentAdSet(extra: { advantageAudience?: boolean } = {}) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "as_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await createMetaAdSet({ ...base, ...extra });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const params = new URLSearchParams(String(init.body));
    return { targeting: JSON.parse(params.get("targeting") ?? "{}"), params };
  }

  it("désactive l'audience Advantage+ par défaut", async () => {
    const { targeting } = await sentAdSet();
    expect(targeting.targeting_automation).toEqual({ advantage_audience: 0 });
    expect(targeting.age_min).toBe(18);
    expect(targeting.age_max).toBe(45);
  });

  it("l'active quand demandé", async () => {
    const { targeting } = await sentAdSet({ advantageAudience: true });
    expect(targeting.targeting_automation).toEqual({ advantage_audience: 1 });
  });

  it("laisse Meta choisir automatiquement les placements tout en conservant la destination Web", async () => {
    const { targeting, params } = await sentAdSet();
    expect(targeting).not.toHaveProperty("publisher_platforms");
    expect(targeting).not.toHaveProperty("instagram_positions");
    expect(targeting).not.toHaveProperty("whatsapp_positions");
    expect(targeting).not.toHaveProperty("user_age_unknown");
    expect(params.get("destination_type")).toBe("WEBSITE");
  });

  it("n'enlève jamais destination_type WEBSITE si Meta le refuse", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Website destination unavailable" } }), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createMetaAdSet(base)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
