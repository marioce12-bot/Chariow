import { describe, expect, it } from "vitest";
import { buildStudioVideoPrompt } from "@/lib/studio/product-prompt";

describe("editable Studio video prompt", () => {
  it("always emits a product-specific UGC direction and removes a legacy Motion Design request", () => {
    const prompt = buildStudioVideoPrompt("Motion design dynamique pour présenter ce guide.", {
      name: "Guide cuisine",
      description: "Disponible en PDF.",
      imageUrl: "https://cdn.chariow.com/couverture.png",
    });
    expect(prompt).toContain("UGC uniquement");
    expect(prompt).toContain("noirs ou métissés");
    expect(prompt).toContain("Guide cuisine");
    expect(prompt).toContain("Disponible en PDF.");
    expect(prompt).not.toMatch(/motion[ -]?design/i);
  });

  it("keeps the prompt generator available without inventing a product", () => {
    const prompt = buildStudioVideoPrompt("Lumière naturelle, ton chaleureux.", null);
    expect(prompt).toContain("UGC uniquement");
    expect(prompt).toContain("Lumière naturelle");
  });
});
