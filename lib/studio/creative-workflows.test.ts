import { describe, expect, it } from "vitest";
import { inferProductType, isSupportedVideoDuration, isSupportedVideoResolution, isSupportedVideoAspectRatio, VIDEO_DURATIONS, VIDEO_RESOLUTIONS, VIDEO_ASPECT_RATIOS } from "./creative-workflows";
import { buildCreativeBrief, briefToPrompt } from "./creative-brief";

describe("creative-workflows", () => {
  it("valide uniquement les capacités réellement supportées (pas de mapping silencieux)", () => {
    expect(isSupportedVideoDuration(6)).toBe(true);
    expect(isSupportedVideoDuration(8)).toBe(true);
    expect(isSupportedVideoDuration(10)).toBe(true);
    expect(isSupportedVideoDuration(30)).toBe(false);
    expect(isSupportedVideoDuration(40)).toBe(false);

    expect(isSupportedVideoResolution("1080p")).toBe(true);
    expect(isSupportedVideoResolution("768p")).toBe(false);

    expect(isSupportedVideoAspectRatio("16:9")).toBe(true);
    expect(isSupportedVideoAspectRatio("9:16")).toBe(true);
    expect(isSupportedVideoAspectRatio("21:9")).toBe(false);
    expect(isSupportedVideoAspectRatio("1:1")).toBe(false);
  });

  it("expose des listes cohérentes pour l'interface", () => {
    expect(VIDEO_DURATIONS).toEqual([6, 8, 10]);
    expect(VIDEO_RESOLUTIONS).toEqual(["1080p"]);
    expect(VIDEO_ASPECT_RATIOS).toEqual(["16:9", "9:16"]);
  });

  it("infère le type de produit depuis le nom et la description", () => {
    expect(inferProductType("Mon ebook sur la vente")).toBe("ebook");
    expect(inferProductType("Robe d'été en lin")).toBe("mode");
    expect(inferProductType("Formation complète au marketing")).toBe("formation");
    expect(inferProductType("Restaurant — plat du jour")).toBe("food");
    expect(inferProductType("Application de gestion SaaS")).toBe("saas");
    expect(inferProductType("Produit mystère")).toBe("physique");
    expect(inferProductType("Chose indéfinissable")).toBe("autre");
  });
});

describe("creative-brief", () => {
  const product = { name: "Mon ebook", description: "Un guide pratique", price: "5000", currency: "XOF" };

  it("n'invente pas de caractéristique commerciale : prix et nom viennent du produit", () => {
    const brief = buildCreativeBrief(product, "Affiche premium et élégante", "image");
    expect(brief.productName).toBe("Mon ebook");
    expect(brief.price).toBe("5000 XOF");
    expect(brief.productDescription).toBe("Un guide pratique");
    expect(brief.productType).toBe("ebook");
  });

  it("adapte la direction artistique au type de produit", () => {
    const ebook = buildCreativeBrief(product, "", "image");
    const mode = buildCreativeBrief({ name: "Robe d'été" }, "", "image");
    expect(ebook.productType).toBe("ebook");
    expect(mode.productType).toBe("mode");
    expect(ebook.style).not.toBe(mode.style);
  });

  it("le prompt de vidéo conserve le produit sans le recréer", () => {
    const brief = buildCreativeBrief(product, "Mise en scène élégante", "video");
    const prompt = briefToPrompt(brief, "video", true);
    expect(prompt).toContain("Conserve-le à l'identique");
    expect(prompt).toContain("Mon ebook");
  });
});