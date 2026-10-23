import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("components/Marketing.tsx", "utf8");
const visualSource = readFileSync("components/DigitalWorkspaceVisual.tsx", "utf8");

describe("five-scene digital workspace carousel", () => {
  it("shows five scenes with real Vendeo screenshots and advances automatically every four seconds", () => {
    expect(visualSource).toContain('aria-roledescription={en ? "carousel" : "carrousel"}');
    expect(visualSource.match(/image: "\/landing\/flow-story-0[1-5]\.webp"/g)).toHaveLength(10);
    expect(visualSource.match(/screenshot: "\//g)).toHaveLength(10);
    expect(visualSource).toContain("window.setInterval");
    expect(visualSource).toContain("SCENE_DURATION_MS = 4000");
    expect(visualSource).toContain("Parcours tout-en-un");
    expect(visualSource).not.toContain("<button");
    expect(visualSource).not.toContain("story-arrow");
    expect(visualSource).not.toContain("story-dot");
    expect(visualSource).not.toContain("claim1minute");
    expect(visualSource).not.toContain("1 minute");
  });

  it("keeps the selected French headline, all-in-one story and CTA destinations", () => {
    expect(source).toContain("Du produit digital à la pub lancée.");
    expect(source).toContain("Puis suis tes commandes.");
    expect(source).toContain("5 jours d’essai · 100 crédits de bienvenue");
    expect(source).toContain("Lancer mon essai gratuit");
    expect(source).toContain('href="/register"');
    expect(source).toContain("Découvrir comment ça marche");
    expect(source).toContain('href="#apercu"');
    expect(source).toContain("Crée des publicités image ou vidéo avec l’IA");
  });
});
