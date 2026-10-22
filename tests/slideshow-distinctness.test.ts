import { describe, expect, it, vi } from "vitest";
import { assertSlideshowPlan, buildSlideshowPlan, prepareSlideshowImages, runPreparedSlideshow, slideshowEvidence } from "@/lib/studio/slideshow-plan";
import { nearDuplicate } from "@/lib/studio/slideshow-distinctness";
const input = { name: "Produit Atlas", description: "Le fichier est disponible au format PDF.\nDes exercices accompagnent chaque chapitre.\nLa lecture est possible sans connexion.", hasReference: true, duration: 25, aspectRatio: "9:16", character: "with" as const };
function recompile(plan: ReturnType<typeof buildSlideshowPlan>) {
  // Keep metadata and provider prompt in sync, so checks cannot pass just because wording/numbering differs.
  plan.slides = plan.slides.map((slide, index) => {
    const original = buildSlideshowPlan(input).slides[index];
    return { ...slide, prompt: original.prompt
      .replace(`ART DIRECTION: ${original.layout}\nSCENE: ${original.scene}\nVISUAL MESSAGE: ${original.visualMessage}\n`, `ART DIRECTION: ${slide.layout}\nSCENE: ${slide.scene}\nVISUAL MESSAGE: ${slide.visualMessage}\n`)
      .replace(JSON.stringify([original.headline, ...original.supportingCopy, `${index + 1}/5`]), JSON.stringify([slide.headline, ...slide.supportingCopy, `${index + 1}/5`])) };
  });
  return plan;
}
describe("Deterministic pre-generation copy and visual semantics guards", () => {
  it.each([
    ["Le pack réunit trois guides pratiques", "Le pack rassemble 3 ouvrages pratiques"],
    ["Le fichier est disponible au format PDF", "Le document est proposé en PDF"],
    ["Lecture sans connexion", "Lecture hors ligne"],
    ["Découvre Pack spécial Promo développement", "Explore Pack spécial Promo développement"],
    ["Read offline", "Read without internet connection"],
  ])("recognizes near-paraphrases without a paid model: %s", (a, b) => expect(nearDuplicate(a, b)).toBe(true));
  it("does not merge three genuinely different facts", () => {
    expect(slideshowEvidence(input.description, input.name)).toHaveLength(3);
    expect(() => assertSlideshowPlan(buildSlideshowPlan(input))).not.toThrow();
  });
  it("stops the known Promo repetition instead of using repeated title/benefit as filler", () => {
    expect(() => buildSlideshowPlan({ ...input, name: "Pack spécial Promo développement", description: "Le Pack spécial promo réunit trois guides pratiques pour transformer tes idées en actions concrètes.\nLe Pack spécial promo rassemble 3 guides pratiques pour transformer tes idées en actions concrètes." })).toThrow("insuffisantes");
  });
  it("never consumes the objective hook again as an evidence beat", () => {
    const objective = "Un guide pour apprendre à créer un site web.";
    const plan = buildSlideshowPlan({ ...input, description: objective + "\n" + input.description });
    expect(plan.slides[0].source?.excerpt).toBe(objective);
    expect(plan.slides.slice(1, 4).map(slide => slide.source?.excerpt)).toEqual(input.description.split("\n"));
    expect(plan.slides.at(-1)?.headline).toBe("Découvre le guide");
    expect(plan.slides.slice(1).some(slide => slide.headline.includes(input.name))).toBe(false);
    expect(new Set(plan.slides.map(slide => slide.scene)).size).toBe(5);
  });
  it("does not claim a Snapchat launch from detached campaign/statistics references", () => {
    const description = "Guide d'analyse des statistiques des campagnes Snapchat. Il explique le ciblage. Il présente des exemples pratiques. Les étapes sont organisées par niveau.";
    const plan = buildSlideshowPlan({ ...input, name: "Guide Snapchat", description, campaignGoal: "buy" });
    expect(plan.slides.at(-1)?.headline).toBe("Procure-toi le guide");
    expect(plan.slides.at(-1)?.headline).not.toMatch(/lancer tes campagnes/i);
  });
  it("permits a booking CTA only for explicit service-booking language, never a guide", () => {
    const explicit = "Service de séance photo. Réserver une séance photo avec notre studio. La séance comprend une galerie privée. Livraison numérique des images.";
    expect(buildSlideshowPlan({ ...input, name: "Séance photo studio", description: explicit, campaignGoal: "buy" }).slides.at(-1)?.headline).toBe("Réserve ta séance");
    const guide = "Guide pour réserver une séance photo. Il présente les étapes de préparation. Il détaille les différents objectifs. Il contient des exercices pratiques.";
    expect(buildSlideshowPlan({ ...input, name: "Guide photo", description: guide, campaignGoal: "buy" }).slides.at(-1)?.headline).toBe("Procure-toi le guide");
  });
  it.each(["headline", "source", "scene", "visualMessage", "layout", "prompt"] as const)("blocks repeated %s across all slides before any image/music/assembly call", async field => {
    const plan = buildSlideshowPlan(input);
    if (field === "source") plan.slides[3].source = plan.slides[1].source;
    else plan.slides[3][field] = plan.slides[1][field];
    if (field !== "prompt") recompile(plan);
    const generateImage = vi.fn(), resolveLicensedMusic = vi.fn(), assemble = vi.fn();
    await expect(prepareSlideshowImages(plan, "job", generateImage)).rejects.toThrow();
    await expect(runPreparedSlideshow(plan, "job", { generateImage, resolveLicensedMusic, assemble })).rejects.toThrow();
    expect(generateImage).not.toHaveBeenCalled(); expect(resolveLicensedMusic).not.toHaveBeenCalled(); expect(assemble).not.toHaveBeenCalled();
  });
  it("does not compare the shared brand/fidelity/person boilerplate as if it were a duplicate scene", () => {
    const plan = buildSlideshowPlan({ ...input, hasReference: false, locale: "en" });
    expect(() => assertSlideshowPlan(plan)).not.toThrow();
    expect(plan.slides.every(slide => slide.prompt.includes("Include one clearly visible, staged person"))).toBe(true);
    expect(plan.slides.every(slide => slide.prompt.length <= 4000)).toBe(true);
  });
});
