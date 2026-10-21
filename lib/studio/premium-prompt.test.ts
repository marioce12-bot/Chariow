import { describe, expect, it } from "vitest";
import { buildPremiumImagePrompt } from "./premium-prompt";

describe("premium creative director prompt", () => {
  it("keeps the user's exact brief and adds production direction", () => {
    const prompt = buildPremiumImagePrompt({
      prompt: 'Exact visible text: "LANCER SES PUBLICITÉS". Show a realistic mixed-race woman pointing to the ebook.',
      orientation: "square",
      background: "opaque",
      hasReferences: false,
    });

    expect(prompt).toContain('"LANCER SES PUBLICITÉS"');
    expect(prompt).toContain("deliberate visual hierarchy");
    expect(prompt).toContain("do not require a person when absent from the brief");
    expect(prompt).toContain("finished campaign asset");
  });

  it("adds reference and transparent-background safeguards", () => {
    const prompt = buildPremiumImagePrompt({
      prompt: "Create a clean product cutout.",
      orientation: "portrait",
      background: "transparent",
      hasReferences: true,
    });

    expect(prompt).toContain("actual product identity, branding and palette only");
    expect(prompt).toContain("If the user explicitly requests a reference's composition or style, honor that request.");
    expect(prompt).toContain("genuinely transparent");
    expect(prompt).toContain("vertical social composition");
  });
});
