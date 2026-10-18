import { describe, expect, it } from "vitest";
import { resolveCampaignAnswer } from "@/lib/chariow/chat-product";
const catalog = [
  { id: "prd_guide1", name: "Guide IA", storeId: "store-a", storeName: "Scale-X", url: "https://store-a.mychariow.shop/prd_guide1" },
  { id: "prd_guide2", name: "Guide IA", storeId: "store-b", storeName: "Formation", url: "https://store-b.mychariow.shop/prd_guide2" },
];
const marker = (payload: unknown) => `Résumé validé\n[[LANCE_CAMPAGNE]]${JSON.stringify(payload)}`;
function readPayload(answer: string) { return JSON.parse(answer.split("[[LANCE_CAMPAGNE]]")[1]); }
describe("chat campaign product destination", () => {
  it.each(["fr", "en"])("%s fills the exact product and store without asking for an URL", locale => {
    const answer = resolveCampaignAnswer(marker({ name: "Campaign launch", productName: "Guide IA", storeName: "Scale-X", platform: "meta", linkUrl: null }), catalog, { locale });
    expect(readPayload(answer)).toMatchObject({ productId: "prd_guide1", storeId: "store-a", linkUrl: catalog[0].url });
    expect(answer).not.toMatch(/Which exact|Quel produit/);
  });
  it.each(["meta", "pinterest"])("%s carries the resolved URL and identity to confirmation", platform => {
    const answer = resolveCampaignAnswer(marker({ productId: "prd_guide2", platform }), catalog);
    expect(readPayload(answer)).toMatchObject({ platform, storeId: "store-b", linkUrl: catalog[1].url });
  });
  it.each(["fr", "en"])("%s asks only to choose product/store when ambiguous", locale => {
    const answer = resolveCampaignAnswer(marker({ productName: "Guide IA" }), catalog, { locale });
    expect(answer).not.toContain("[[LANCE_CAMPAGNE]]");
    expect(answer).toContain(locale === "en" ? "Which exact product and store" : "Quel produit exact et quelle boutique");
    expect(answer).not.toMatch(/provide.*URL|donne.*lien/i);
  });
  it("does not accept an AI-invented URL but preserves a user-provided override", () => {
    const linkUrl = "https://manual.example/custom";
    const input = marker({ productId: "prd_guide1", linkUrl });
    expect(readPayload(resolveCampaignAnswer(input, catalog)).linkUrl).toBe(catalog[0].url);
    expect(readPayload(resolveCampaignAnswer(input, catalog, { userProvidedUrls: [linkUrl] })).linkUrl).toBe(linkUrl);
  });
  it("strips malformed model actions instead of allowing a launch", () => {
    for (const payload of ["{broken", "null", "[]", '"text"']) expect(resolveCampaignAnswer(`[[LANCE_CAMPAGNE]]${payload}`, catalog)).not.toContain("[[LANCE_CAMPAGNE]]");
  });
  it("does not ask for an URL when the resolved product link is temporarily unavailable", () => {
    const answer = resolveCampaignAnswer(marker({ productId: "prd_guide1" }), [{ ...catalog[0], url: null }], { locale: "en" });
    expect(answer).toContain("public link is currently unavailable");
    expect(answer).not.toContain("[[LANCE_CAMPAGNE]]");
  });
  it("leaves TikTok wizard guidance and ordinary chat responses unchanged", () => {
    const answer = "For TikTok, use Ads → Launch an ad → TikTok.";
    expect(resolveCampaignAnswer(answer, catalog, { locale: "en" })).toBe(answer);
  });
});
