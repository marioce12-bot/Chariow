import { describe, expect, it } from "vitest";
import { buildPosterDirection } from "./poster-direction";

describe("product-led poster direction", () => {
  it("does not impose a palette, person, outfit or product mockup", () => {
    const { text } = buildPosterDirection({ name: "Bundle de ressources", description: "Un ensemble de guides et modèles" });
    expect(text).toContain("No preset palette, person, outfit, layout, mockup");
    expect(text).toContain("Preserve bundle structure as a bundle");
    expect(text).toContain("never invent a screen or package");
  });
  it("respects with and without choices, while auto permits absence", () => {
    expect(buildPosterDirection({ name: "Produit", character: "with" }).text).toContain("Include a person");
    expect(buildPosterDirection({ name: "Produit", character: "without" }).text).toContain("Do not include any person");
    expect(buildPosterDirection({ name: "Produit", character: "auto" }).text).toContain("Person presence is optional");
  });
  it("uses provided product details as context, not a hard-coded art recipe", () => {
    const { text } = buildPosterDirection({ name: "Cours photo", description: "Photographie argentique" });
    expect(text).toContain("Cours photo Photographie argentique");
  });
});
