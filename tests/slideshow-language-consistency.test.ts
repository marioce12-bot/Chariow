import { describe, expect, it } from "vitest";
import { buildSlideshowPlan } from "@/lib/studio/slideshow-plan";
import { buildSlideshowVoicePlan } from "@/lib/studio/slideshow-voice";
import { validateSlideshowImageRequest } from "@/lib/studio/slideshow-image-request";

const products = [
  { code: "en", locale: "fr", label: "English", product: { name: "Practical Guide", description: "This guide is available in PDF format. The guide contains eight chapters about preparing a garden. Each chapter includes three practical exercises, a materials checklist and a seasonal calendar. The worksheets explain seed selection, soil preparation, regular watering, crop rotation and harvesting. The illustrations show plants grown in pots and in the ground. The download can be read offline on a phone or tablet." } },
  { code: "fr", locale: "en", label: "French", product: { name: "Guide pratique", description: "Ce guide est disponible au format PDF. Le guide comporte huit chapitres consacrés à la préparation du jardin. Chaque chapitre présente trois exercices pratiques, une liste de matériel et un calendrier saisonnier. Les fiches expliquent le choix des graines, la préparation du sol, l’arrosage régulier, la rotation des cultures et la récolte. Les illustrations montrent des plantations en pots et en pleine terre. Le téléchargement permet une lecture hors connexion sur téléphone ou tablette." } },
  { code: "es", locale: "fr", label: "Spanish", product: { name: "Guía práctica", description: "Esta guía está disponible en formato PDF. El libro contiene ocho capítulos sobre la preparación del jardín. Cada capítulo incluye tres ejercicios prácticos, una lista de materiales y un calendario estacional. Las fichas explican la selección de semillas, la preparación del suelo, el riego regular y la cosecha. Las ilustraciones muestran plantas en macetas y en el suelo. Puedes leer el archivo sin conexión a internet en tu teléfono o tableta." } },
];

describe("Slideshow source language consistency, without provider calls", () => {
  it.each(products)("aligns $code images, server revalidation and narration with $locale UI", ({ code, locale, label, product }) => {
    const input = { ...product, hasReference: false, duration: 25, aspectRatio: "9:16", character: "with" as const, locale };
    const plan = buildSlideshowPlan(input);
    const voice = buildSlideshowVoicePlan(product, 25, locale);
    expect(voice.language).toBe(code);
    expect(voice.script).toContain(product.name);
    expect(voice.script).not.toMatch(/SCENE:|ART DIRECTION:|speech_metadata|chaleureux et narratif/);
    expect(voice.script).toContain(plan.slides[4].headline);
    for (const slide of plan.slides) {
      expect(slide.prompt).toContain(label);
      const validated = validateSlideshowImageRequest({ product, duration: 25, aspectRatio: "9:16", locale, imageCount: 5, slideIndex: slide.index }, "production");
      expect(validated.prompt).toBe(slide.prompt);
    }
    if (code !== "fr") {
      expect(voice.script).not.toMatch(/Découvre|Procure-toi|Prends ton/);
      expect(plan.slides.map(s => s.headline).join(" ")).not.toMatch(/Découvre|Procure-toi|Prends ton/);
    }
  });
});
