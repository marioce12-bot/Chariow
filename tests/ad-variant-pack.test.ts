import { describe, expect, it } from "vitest";
import { haveThreeChosenFormats, isVariantPackStore, recommendPackAction, selectRecommendedAngles } from "../lib/ad-variant-pack";

describe("ad variant pack", () => {
  it("accepts connected Chariow and Shopify stores only", () => {
    expect(isVariantPackStore({ platform: "chariow", connection_status: "connected" })).toBe(true);
    expect(isVariantPackStore({ platform: "shopify", connection_status: "connected" })).toBe(true);
    expect(isVariantPackStore({ platform: "shopify", connection_status: "pending" })).toBe(false);
    expect(isVariantPackStore({ platform: "selar", connection_status: "connected" })).toBe(false);
  });

  it("allows the user to repeat the same format across all three variants", () => {
    expect(haveThreeChosenFormats(["image", "image", "image"])).toBe(true);
    expect(haveThreeChosenFormats(["video", "carousel", "video"])).toBe(true);
    expect(haveThreeChosenFormats(["image", "", "image"])).toBe(false);
    expect(haveThreeChosenFormats(["image", "unsupported", "video"])).toBe(false);
  });

  it("keeps exactly the three AI-recommended angles when there are five candidates", () => {
    const angles = Array.from({ length: 5 }, (_, i) => ({ id: String(i), recommended: i < 3 }));
    expect(selectRecommendedAngles(angles).map((row) => row.id)).toEqual(["0", "1", "2"]);
  });

  it("does not name a winner with insufficient impressions, clicks, or purchases", () => {
    const result = recommendPackAction([
      { id: "a", impressions: 900, clicks: 30, purchases: 8, spend: 20 },
      { id: "b", impressions: 2000, clicks: 40, purchases: 8, spend: 30 },
    ]);
    expect(result).toEqual({ kind: "insufficient_data", keep: [], pause: [] });
  });

  it("keeps the best variant only when evidence is sufficient and results differ", () => {
    const result = recommendPackAction([
      { id: "best", impressions: 4000, clicks: 120, purchases: 12, spend: 24 },
      { id: "other", impressions: 5000, clicks: 100, purchases: 8, spend: 32 },
      { id: "third", impressions: 3500, clicks: 70, purchases: 6, spend: 36 },
    ]);
    expect(result).toEqual({ kind: "keep_one", keep: ["best"], pause: ["other", "third"] });
  });

  it("keeps the top two when their cost per purchase is within ten percent", () => {
    const result = recommendPackAction([
      { id: "a", impressions: 3000, clicks: 50, purchases: 10, spend: 20 },
      { id: "b", impressions: 3000, clicks: 50, purchases: 10, spend: 21 },
      { id: "c", impressions: 3000, clicks: 50, purchases: 5, spend: 20 },
    ]);
    expect(result).toEqual({ kind: "keep_two", keep: ["a", "b"], pause: ["c"] });
  });
});
