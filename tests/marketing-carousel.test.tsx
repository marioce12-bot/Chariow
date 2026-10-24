import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("components/Marketing.tsx", "utf8");
const visualSource = readFileSync("components/DigitalWorkspaceVisual.tsx", "utf8");

describe("verified three-scene Vendeo workflow carousel", () => {
  it("shows the three remaining workflow scenes and advances automatically every four seconds", () => {
    expect(visualSource).toContain('aria-roledescription={en ? "carousel" : "carrousel"}');
    expect(visualSource).toContain("Parcours en trois étapes");
    expect(visualSource.match(/image: "\/landing\/flow-story-0[134]\.webp"/g)).toHaveLength(6);
    expect(visualSource.match(/screenshot: "\//g)).toHaveLength(6);
    expect(visualSource).not.toContain("/landing/performance-visuel-desktop.webp");
    expect(visualSource).not.toContain("/landing/performance-visuel-mobile.webp");
    expect(visualSource).not.toContain("story-phone-capture");
    expect(visualSource).toContain("recommandations préparent un brouillon");
    expect(visualSource).toContain("Recommendations prepare a draft");
    expect(visualSource).not.toMatch(/Performance visuel|Creative performance|Compare tes visuels|Compare ad visuals/i);
    expect(visualSource).toContain("window.setInterval");
    expect(visualSource).toContain("SCENE_DURATION_MS = 4000");
    expect(visualSource).toContain("The Vendeo workflow");
    expect(visualSource).toContain("Le parcours Vendeo");
    expect(visualSource).toContain("données de démonstration");
    expect(visualSource).not.toMatch(/Shopify|actual-studio|video|vidéo|assistant IA/i);
    expect(visualSource).not.toContain("<button");
    expect(visualSource).not.toContain("story-arrow");
    expect(visualSource).not.toContain("story-dot");
    expect(visualSource).not.toContain("claim1minute");
    expect(visualSource).not.toContain("1 minute");
  });

  it("keeps the production hero, accurate French headlines, credit details and CTA destinations", () => {
    expect(source).toContain("DigitalWorkspaceVisual");
    expect(source).toContain('import "@/app/landing-digital-hero.css"');
    expect(source).toContain("Ta boutique. Tes campagnes.");
    expect(source).toContain("Consulte les données disponibles dans Vendeo.");
    expect(source).toContain("5 jours d’essai · 100 crédits Studio offerts à l'inscription");
    expect(source).toContain("Lancer mon essai gratuit");
    expect(source).toContain('href="/register"');
    expect(source).toContain("Découvrir comment ça marche");
    expect(source).toContain('href="#apercu"');
    expect(source).toContain("Crée des images publicitaires avec le Studio IA");
    expect(source).not.toMatch(/pub lancée|image ou vidéo|sans repayer|track every order/i);
  });
});
