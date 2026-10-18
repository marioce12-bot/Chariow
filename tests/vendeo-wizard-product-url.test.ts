import { describe, expect, it } from "vitest";
import { DEFAULT_WIZARD_STATE, wizardStateForProductSelection, type ChariowProductLite } from "../components/vendeo/wizard/types";

const first: ChariowProductLite = {
  id: "product-1", name: "First", description: null, price: null, currency: null, image: null,
  // Product URLs are already normalized by the catalog source; wizard uses this value verbatim.
  url: "https://shop.example/prd_1?source=catalog",
};
const second: ChariowProductLite = { ...first, id: "product-2", name: "Second", url: "https://shop.example/prd_2" };

describe("campaign wizard product destination URL", () => {
  it.each(["fr", "en"]) ("prefills a product selected before opening (%s locale)", () => {
    const initialProduct = first;
    const state = { ...DEFAULT_WIZARD_STATE, storeId: "store-1", product: initialProduct, destinationUrl: initialProduct.url ?? "" };
    expect(state.destinationUrl).toBe(first.url);
  });

  it.each(["meta", "tiktok", "pinterest"] as const)("uses the selected product URL on %s", (platform) => {
    const state = wizardStateForProductSelection({ ...DEFAULT_WIZARD_STATE, platform, destinationUrl: "https://old.example/custom" }, first);
    expect(state.destinationUrl).toBe(first.url);
    expect(state.platform).toBe(platform);
  });

  it("preserves manual customization when the same product is selected again", () => {
    const customized = "https://landing.example/custom";
    const state = wizardStateForProductSelection({ ...DEFAULT_WIZARD_STATE, product: first, destinationUrl: customized }, first);
    expect(state.destinationUrl).toBe(customized);
  });

  it("replaces the old link when switching products and clears it when switching stores", () => {
    const switched = wizardStateForProductSelection({ ...DEFAULT_WIZARD_STATE, product: first, destinationUrl: "https://old.example/custom" }, second);
    expect(switched.destinationUrl).toBe(second.url);
    const newStore = { ...switched, storeId: "store-2", product: null, destinationUrl: "" };
    expect(newStore.destinationUrl).toBe("");
  });

  it("uses an empty value when the selected product has no URL", () => {
    const withoutUrl = { ...second, url: null };
    expect(wizardStateForProductSelection({ ...DEFAULT_WIZARD_STATE, product: first, destinationUrl: first.url! }, withoutUrl).destinationUrl).toBe("");
  });
});
