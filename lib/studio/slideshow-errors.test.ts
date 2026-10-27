import { describe, expect, it } from "vitest";
import { publicSlideshowError, slideshowPublicFailure, slideshowStoryboardDetailsMessage } from "@/lib/studio/slideshow-errors";

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

  it("builds the short-description message only from validated structured server fields", () => {
    const requirements = { duration: 25, requiredWords: 58, missingWords: 4, wordCount: 54 };
    expect(publicSlideshowError("private server detail", "fr", "INSUFFICIENT_PRODUCT_DETAILS", requirements)).toBe(
      "La description de ce produit dans ta boutique est trop courte pour une voix off de 25 secondes. Il faut environ 58 mots décrivant le produit (ce qu'il contient, à quoi il sert, pour qui) ; il en manque environ 4. Complète la description dans ta boutique, puis reviens ici et appuie sur « Réessayer ». Aucune image n'a été générée et aucun crédit n'a été consommé.",
    );
    expect(publicSlideshowError("private server detail", "en", "INSUFFICIENT_PRODUCT_DETAILS", requirements)).toContain("click “Retry”");
    expect(publicSlideshowError("storyboard detail", "fr", "INSUFFICIENT_PRODUCT_DETAILS")).toBe(slideshowStoryboardDetailsMessage("fr"));
    expect(publicSlideshowError("Add product details below", "fr", "INSUFFICIENT_PRODUCT_DETAILS", { duration: 25, requiredWords: "58", missingWords: -1 }))
      .toBe(slideshowStoryboardDetailsMessage("fr"));
    expect(publicSlideshowError("private server detail", "fr", "INSUFFICIENT_PRODUCT_DETAILS", { duration: 25, requiredWords: 58, missingWords: 0, wordCount: 58 }))
      .toBe(slideshowStoryboardDetailsMessage("fr"));
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
