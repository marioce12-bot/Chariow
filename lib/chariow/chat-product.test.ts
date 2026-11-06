import { describe, expect, it } from "vitest";
import { resolveCampaignAnswer, resolveCampaignProduct } from "./chat-product";
const catalog = [
  { id: "prd_1", name: "Guide", storeId: "s1", storeName: "Boutique A", url: "https://a.mychariow.shop/prd_1" },
  { id: "prd_2", name: "Guide", storeId: "s2", storeName: "Boutique B", url: "https://b.mychariow.shop/prd_2" },
];
describe("resolveCampaignProduct", () => {
  it("resolves by catalog product ID and accepts a manual URL only when user-sourced", () => {
    const payload = { productId: "prd_1", linkUrl: "https://manual.example/page" };
    expect(resolveCampaignProduct(payload, catalog)).toMatchObject({ productId: "prd_1", storeId: "s1", linkUrl: catalog[0].url });
    expect(resolveCampaignProduct(payload, catalog, [payload.linkUrl])).toMatchObject({ linkUrl: payload.linkUrl });
  });
  it("resolves productName with a store and refuses ambiguity, mismatch, or campaign name", () => {
    expect(resolveCampaignProduct({ productName: "Guide", storeId: "s1" }, catalog)).toMatchObject({ productId: "prd_1", storeId: "s1" });
    expect(resolveCampaignProduct({ productName: "Guide" }, catalog)).toEqual({ error: "ambiguous" });
    expect(resolveCampaignProduct({ name: "Guide" }, catalog)).toEqual({ error: "missing" });
    expect(resolveCampaignProduct({ productId: "prd_1", storeId: "s2" }, catalog)).toEqual({ error: "missing" });
  });
  it("parses fenced JSON containing real newlines, emojis and quotes", () => {
    const answer = `Je lance la campagne.\n[[LANCE_CAMPAGNE]]\n\`\`\`json\n{"productId":"prd_1","message":"Découvre 😊\naujourd'hui","headline":"L'offre \\\"Guide\\\""}\n\`\`\``;
    const resolved = resolveCampaignAnswer(answer, catalog, { conversationId: "conversation-test" });
    expect(resolved).toContain("[[LANCE_CAMPAGNE]]");
    expect(JSON.parse(resolved.split("[[LANCE_CAMPAGNE]]")[1])).toMatchObject({ productId: "prd_1", storeId: "s1", message: "Découvre 😊\naujourd'hui" });
    expect(resolved).not.toContain("Je lance la campagne");
  });
  it("removes launch language and explains a missing or ambiguous product", () => {
    const missing = resolveCampaignAnswer("Parfait ! Je lance la campagne. [[LANCE_CAMPAGNE]]{\"productName\":\"Inconnu\"}", catalog, { locale: "fr" });
    expect(missing).not.toContain("[[LANCE_CAMPAGNE]]");
    expect(missing).not.toMatch(/je lance/i);
    expect(missing).toContain("introuvable");
    const ambiguous = resolveCampaignAnswer("Je lance la campagne [[LANCE_CAMPAGNE]]{\"productName\":\"Guide\"}", catalog, { locale: "fr" });
    expect(ambiguous).toContain("Plusieurs produits");
    expect(ambiguous).not.toMatch(/je lance/i);
  });
});
