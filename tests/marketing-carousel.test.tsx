import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("components/Marketing.tsx", "utf8");

describe("static digital workspace hero", () => {
  it("does not render or implement a carousel, interval, or one-minute claim", () => {
    expect(source).not.toContain("PlatformRotator");
    expect(source).not.toContain("landing-showcase");
    expect(source).not.toContain("activeDemo");
    expect(source).not.toContain("setInterval");
    expect(source).not.toContain("claim1minute");
    expect(source).not.toContain("1 minute");
  });

  it("keeps the hero generic and uses the new French message and CTA destinations", () => {
    expect(source).toContain("Ta boutique, tes visuels, tes pubs.");
    expect(source).toContain("Tout au même endroit.");
    expect(source).toContain("quelques clics");
    expect(source).toContain("5 jours d’essai · 100 crédits de bienvenue");
    expect(source).not.toContain("Shopify");
    expect(source).not.toContain("Chariow");
    expect(source).toContain("Lancer mon essai gratuit");
    expect(source).toContain('href="/register"');
    expect(source).toContain("Découvrir comment ça marche");
    expect(source).toContain('href="#apercu"');
  });
});
