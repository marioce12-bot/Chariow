import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("components/Marketing.tsx", "utf8");
const visualSource = readFileSync("components/DigitalWorkspaceVisual.tsx", "utf8");

describe("verified four-scene Vendeo workflow carousel", () => {
  it("shows four real workflow scenes and advances automatically every four seconds", () => {
    expect(visualSource).toContain('aria-roledescription={en ? "carousel" : "carrousel"}');
    expect(visualSource).toContain("Parcours en quatre étapes");
    expect(visualSource.match(/image: "\/landing\/flow-story-0[134]\.webp"/g)).toHaveLength(8);
    expect(visualSource.match(/screenshot: "\//g)).toHaveLength(8);
    expect(visualSource.match(/mobileScreenshot: "\//g)).toHaveLength(2);
    expect(visualSource).toContain("/landing/performance-visuel-desktop.webp");
    expect(visualSource).toContain("/landing/performance-visuel-mobile.webp");
    expect(visualSource).toContain("story-phone-capture");
    expect(visualSource).toContain("sans chiffre d’exemple");
    expect(visualSource).toContain("no sample figures");
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
