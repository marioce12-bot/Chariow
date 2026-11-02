import { describe, expect, it } from "vitest";
import { CREDIT_PRICE_XOF, videoCreditCost } from "@/lib/studio/credits";
import { STUDIO_VIDEO_RESOLUTIONS, isSupportedStudioVideoResolution } from "@/lib/studio/creative-workflows";

describe("Studio video pricing", () => {
  it("prices 25-second portrait renders at the two approved tiers", () => {
    expect(videoCreditCost("480p", 25)).toBe(750);
    expect(videoCreditCost("720p", 25)).toBe(1300);
    expect(videoCreditCost("480p", 25) * CREDIT_PRICE_XOF).toBe(1875);
    expect(videoCreditCost("720p", 25) * CREDIT_PRICE_XOF).toBe(3250);
    expect(STUDIO_VIDEO_RESOLUTIONS).toEqual(["480p", "720p"]);
  });

  it("does not silently invent pricing for another resolution or duration", () => {
    expect(isSupportedStudioVideoResolution("1080p")).toBe(false);
    expect(() => videoCreditCost("1080p", 25)).toThrow("tarif Studio validé");
    expect(() => videoCreditCost("480p", 0)).toThrow("Durée vidéo invalide");
  });
});
