import { describe, expect, it } from "vitest";
import { resolveCampaignProduct } from "./chat-product";
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
});
