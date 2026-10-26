import { describe, expect, it } from "vitest";
import { publicSlideshowError, slideshowPublicFailure } from "@/lib/studio/slideshow-errors";

describe("public slideshow errors", () => {
  it("returns plain localized copy for narration-duration diagnostics", () => {
    expect(publicSlideshowError("Narration duration 20.09s exceeds 25s limit (95%)", "fr")).toBe(slideshowPublicFailure("fr"));
    expect(publicSlideshowError("TTS provider timeout: duration 20.09", "en")).toBe(slideshowPublicFailure("en"));
  });

  it("sanitizes legacy diagnostics already stored on failed tasks", () => {
    const legacy = { error: "Voiceover render failed: expected 25s, got 20.09s (95%)" };
    expect(publicSlideshowError(legacy.error, "fr")).not.toContain("20.09");
    expect(publicSlideshowError(legacy.error, "fr")).toBe("Création interrompue");
  });

  it("does not pass through unverified text and never returns empty diagnostics", () => {
    expect(publicSlideshowError("Ajoute une description du produit.", "fr")).toBe(slideshowPublicFailure("fr"));
    expect(publicSlideshowError(null, "en")).toBe("Creation interrupted");
  });
});
