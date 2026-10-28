import { describe, expect, it } from "vitest";
import { wizardStateForDuplicate, wizardStateFromCampaign, type EditableCampaign } from "@/components/vendeo/wizard/types";

const original: EditableCampaign = {
  id: "orig-1",
  product_id: "prd_1",
  product_name: "Mon ebook",
  platform: "meta",
  objective: "sales",
  ad_set_name: "Ensemble pub — Mon ebook",
  ad_name: "Publicité — Mon ebook",
  title: "Mon ebook",
  ad_text: "Découvre mon ebook",
  media_url: "https://res.cloudinary.com/demo/image/upload/a.jpg",
  destination_url: "https://boutique.exemple/prd_1?utm_source=vendeo&utm_medium=paid_social&utm_campaign=orig-1",
  call_to_action: "ORDER_NOW",
  advantage_creative: false,
  advantage_audience: true,
  countries: ["BJ"],
  geo_targeting: { countries: ["BJ"], regions: [], cities: [{ key: "123", name: "Cotonou" }] },
  min_age: 20,
  max_age: 40,
  daily_budget: "7",
  duration_days: 3,
  meta_ad_account_id: "acc-1",
  meta_page_id: "page-1",
};

describe("wizardStateForDuplicate", () => {
  const copy = wizardStateForDuplicate(original, "store-1");

  it("reprend toutes les valeurs de l'original", () => {
    expect(copy.storeId).toBe("store-1");
    expect(copy.product?.id).toBe("prd_1");
    expect(copy.platform).toBe("meta");
    expect(copy.adText).toBe("Découvre mon ebook");
    expect(copy.title).toBe("Mon ebook");
    expect(copy.mediaUrl).toBe(original.media_url);
    expect(copy.callToAction).toBe("ORDER_NOW");
    expect(copy.advantageCreative).toBe(false);
    expect(copy.advantageAudience).toBe(true);
    expect(copy.minAge).toBe(20);
    expect(copy.maxAge).toBe(40);
    expect(copy.dailyBudget).toBe(7);
    expect(copy.durationDays).toBe(3);
    expect(copy.metaAdAccountId).toBe("acc-1");
    expect(copy.metaPageId).toBe("page-1");
    expect(copy.locations.map((l) => l.name)).toEqual(["Cotonou"]);
  });

  it("n'a aucun lien avec l'original : le wizard créera un nouveau brouillon", () => {
    expect(copy.campaignId).toBeNull();
    expect(copy.editingCampaignId).toBeNull();
    // Le mode modification, lui, reste attaché à l'original.
    const edited = wizardStateFromCampaign(original, "store-1");
    expect(edited.campaignId).toBe("orig-1");
    expect(edited.editingCampaignId).toBe("orig-1");
  });

  it("retire le utm_campaign de l'original du lien de destination", () => {
    const url = new URL(copy.destinationUrl);
    expect(url.searchParams.has("utm_campaign")).toBe(false);
    expect(url.searchParams.get("utm_source")).toBe("vendeo");
  });

  it("laisse un lien sans suivi tel quel", () => {
    const plain = wizardStateForDuplicate({ ...original, destination_url: "https://boutique.exemple/prd_1" }, "store-1");
    expect(plain.destinationUrl).toBe("https://boutique.exemple/prd_1");
  });

  it("applique les valeurs par défaut aux campagnes antérieures aux réglages", () => {
    const legacy = wizardStateForDuplicate({ ...original, call_to_action: null, advantage_creative: null, advantage_audience: null }, "store-1");
    expect(legacy.callToAction).toBe("LEARN_MORE");
    expect(legacy.advantageCreative).toBe(false);
    expect(legacy.advantageAudience).toBe(false);
  });
});
