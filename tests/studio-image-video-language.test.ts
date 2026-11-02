import { describe, expect, it } from "vitest";
import { buildCreativeBrief, briefToPrompt } from "@/lib/studio/creative-brief";
import { compileFaithfulPrompt } from "@/lib/studio/faithful-prompt";
import { buildVideoAdPlan, type VideoAdInput } from "@/lib/studio/video-plan";

const englishDescription = "This guide helps you learn with practical lessons for your daily work. It includes clear examples and useful exercises for every chapter.";
const frenchDescription = "Ce guide vous aide à apprendre avec des leçons pratiques pour votre travail quotidien. Il comprend des exemples clairs et des exercices utiles pour chaque chapitre.";
const spanishDescription = "Esta guía te ayuda a aprender con lecciones prácticas para tu trabajo diario. Incluye ejemplos claros y ejercicios útiles para cada capítulo.";

describe("studio product language", () => {
  it("keeps English product copy English when the interface locale is French", () => {
    const brief = buildCreativeBrief({ name: "Daily Learning Guide", description: englishDescription }, "", "image");
    expect(brief.productLanguage).toBe("English");
    const prompt = briefToPrompt(brief, "image", false, "poster");
    expect(prompt).toContain("Visible language: English");
    expect(prompt).not.toContain("French headline");
    const faithful = compileFaithfulPrompt({ evidence: { name: "Daily Learning Guide", description: englishDescription, hasReference: false }, candidates: [], plan: { style: "minimal", composition: "spacious", copyIndices: [] }, orientation: "square", background: "auto", character: "auto", locale: "fr" });
    expect(faithful).toContain("Visible language: English");
    const input: VideoAdInput = { name: "Daily Learning Guide", description: englishDescription, hasReference: false, duration: 25, aspectRatio: "9:16", character: "auto", locale: "fr" };
    const video = buildVideoAdPlan(input, '{"direction":"visual_story"}').segments[0].prompt;
    expect(video).toContain("Visible language and narration: English");
    expect(video).toContain('"Discover more"');
    expect(video).not.toContain("French");
  });

  it("keeps French product copy French when the interface locale is English", () => {
    const brief = buildCreativeBrief({ name: "Guide pratique", description: frenchDescription }, "", "image");
    expect(brief.productLanguage).toBe("French");
    expect(briefToPrompt(brief, "image", false, "poster")).toContain("Visible language: French");
    const video = buildVideoAdPlan({ name: "Guide pratique", description: frenchDescription, hasReference: false, duration: 25, aspectRatio: "9:16", character: "auto", locale: "en" }, '{"direction":"visual_story"}').segments[0].prompt;
    expect(video).toContain("Visible language and narration: French");
    expect(video).toContain('"Découvrir"');
  });

  it("supports Spanish product language with a neutral Spanish CTA", () => {
    const brief = buildCreativeBrief({ name: "Guía de aprendizaje", description: spanishDescription }, "", "image");
    expect(brief.productLanguage).toBe("Spanish");
    expect(briefToPrompt(brief, "image", false, "poster")).toContain("Visible language: Spanish");
    const video = buildVideoAdPlan({ name: "Guía de aprendizaje", description: spanishDescription, hasReference: false, duration: 25, aspectRatio: "9:16", character: "auto", locale: "en" }, '{"direction":"visual_story"}').segments[0].prompt;
    expect(video).toContain("Visible language and narration: Spanish");
    expect(video).toContain('"Descubre más"');
    expect(video).not.toContain('"Discover more"');
    expect(video).not.toContain('"Découvrir"');
  });
});
