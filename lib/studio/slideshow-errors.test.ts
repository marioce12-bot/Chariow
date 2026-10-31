import { describe, expect, it } from "vitest";
import { parseVoiceSourceRetryInfo, publicSlideshowError, slideshowPublicFailure } from "@/lib/studio/slideshow-errors";

describe("public slideshow errors", () => {
  it("returns plain localized copy for narration-duration diagnostics", () => {
    expect(publicSlideshowError("Narration duration 20.09s exceeds 25s limit (95%)", "fr")).toBe(slideshowPublicFailure("fr"));
    expect(publicSlideshowError("TTS provider timeout: duration 20.09", "en")).toBe(slideshowPublicFailure("en"));
  });

  it("sanitizes legacy diagnostics already stored on failed tasks", () => {
    const legacy = { error: "Voiceover render failed: expected 25s, got 20.09s (95%)" };
    expect(publicSlideshowError(legacy.error, "fr")).not.toContain("20.09");
    expect(publicSlideshowError(legacy.error, "fr")).toBe(slideshowPublicFailure("fr"));
    expect(publicSlideshowError(legacy.error, "fr")).not.toContain("Consultez l’historique");
  });

  it("gives a concrete next step for the short-source voiceover case", () => {
    const message = publicSlideshowError("54 words available, 61 required", "fr", "SLIDESHOW_VOICE_SOURCE_INSUFFICIENT");
    expect(message).toContain("description du produit dans ta boutique");
    expect(message).toContain("Ajoute quelques faits précis");
    expect(message).not.toContain("54");
    expect(message).not.toContain("étape manquante");
    expect(message).not.toContain("coût restant");
  });
  it("recognizes only the exact legacy measured short-source diagnostic", () => {
    expect(parseVoiceSourceRetryInfo("Source insuffisante pour une narration couvrant 25s (54 mots disponibles, 61 requis); TTS non lancé."))
      .toEqual({ availableWords: 54, requiredWords: 61, maximumWords: 68, providerAttempts: 1 });
    expect(parseVoiceSourceRetryInfo("Le diaporama n’a pas pu être créé.")).toBeNull();
  });

  it("does not pass through unverified text and never returns empty diagnostics", () => {
    expect(publicSlideshowError("Ajoute une description du produit.", "fr")).toBe(slideshowPublicFailure("fr"));
    expect(publicSlideshowError(null, "en")).toBe(slideshowPublicFailure("en"));
  });

  it("explains a retryable Gemini refusal without exposing provider details", () => {
    expect(publicSlideshowError("Gemini voice request refused (HTTP 400).", "fr", "SLIDESHOW_VOICE_RETRYABLE"))
      .toBe("Le service vocal a refusé la demande avant de produire l’audio. Les visuels déjà créés sont conservés ; tu peux relancer sans les recréer.");
    expect(publicSlideshowError("Gemini voice request refused (HTTP 400).", "en", "SLIDESHOW_VOICE_RETRYABLE"))
      .toContain("before producing audio");
  });

  it("explains uncertain Gemini results without exposing provider details or automatic retry wording", () => {
    expect(publicSlideshowError("Gemini voice request outcome is uncertain.", "fr", "SLIDESHOW_VOICE_UNCERTAIN"))
      .toContain("aucune nouvelle demande vocale ne sera lancée automatiquement");
    expect(publicSlideshowError("Gemini voice request outcome is uncertain.", "en", "SLIDESHOW_VOICE_UNCERTAIN"))
      .toContain("no new voice request will be made automatically");
  });
});
