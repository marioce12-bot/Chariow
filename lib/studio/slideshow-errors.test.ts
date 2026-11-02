import { describe, expect, it } from "vitest";
import { publicSlideshowError, shortProductDescriptionMessage, slideshowPublicFailure } from "@/lib/studio/slideshow-errors";

describe("public slideshow errors", () => {
  it("returns plain localized copy for narration-duration diagnostics", () => {
    expect(publicSlideshowError("Narration duration 20.09s exceeds 25s limit (95%)", "fr")).toBe(slideshowPublicFailure("fr"));
    expect(publicSlideshowError("TTS provider timeout: duration 20.09", "en")).toBe(slideshowPublicFailure("en"));
  });

  it("sanitizes legacy diagnostics already stored on failed tasks", () => {
    const legacy = { error: "Voiceover render failed: expected 25s, got 20.09s (95%)" };
    expect(publicSlideshowError(legacy.error, "fr")).not.toContain("20.09");
    expect(publicSlideshowError(legacy.error, "fr")).toBe("Le diaporama n’a pas pu être créé. Consultez l’historique avant de réessayer.");
  });

  it("does not pass through unverified text and never returns empty diagnostics", () => {
    expect(publicSlideshowError("Ajoute une description du produit.", "fr")).toBe(slideshowPublicFailure("fr"));
    expect(publicSlideshowError(null, "en")).toBe("The slideshow could not be created. Check your history before trying again.");
  });

  it("gives a clear shop-description action and does not preserve the old Retry wording", () => {
    expect(shortProductDescriptionMessage("fr", 25)).toContain("diaporama 25 s");
    expect(shortProductDescriptionMessage("fr", 25)).toContain("Revois-la dans ta boutique");
    expect(publicSlideshowError("Complète la description ci-dessous, puis appuie sur Relancer.", "fr", "INSUFFICIENT_PRODUCT_DETAILS"))
      .toBe(shortProductDescriptionMessage("fr"));
    expect(publicSlideshowError("", "en", "SLIDESHOW_VOICE_UNAVAILABLE")).toContain("not enabled in this environment");
  });

  it("explains a retryable Gemini refusal without exposing provider details", () => {
    expect(publicSlideshowError("Gemini voice request refused (HTTP 400).", "fr", "SLIDESHOW_VOICE_RETRYABLE"))
      .toBe("Le service vocal a refusé la demande avant de produire l’audio. Les visuels déjà créés sont conservés ; tu peux relancer sans les recréer.");
    expect(publicSlideshowError("Gemini voice request refused (HTTP 400).", "en", "SLIDESHOW_VOICE_RETRYABLE"))
      .toContain("before producing audio");
  });

  it("explains that uncertain Gemini results stay blocked", () => {
    expect(publicSlideshowError("Gemini voice request outcome is uncertain.", "fr", "SLIDESHOW_VOICE_UNCERTAIN"))
      .toContain("la reprise est bloquée");
    expect(publicSlideshowError("Gemini voice request outcome is uncertain.", "en", "SLIDESHOW_VOICE_UNCERTAIN"))
      .toContain("resuming is blocked");
  });
});
