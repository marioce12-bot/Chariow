import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { translate } from "@/lib/i18n/translate";
const language = vi.hoisted(() => ({ locale: "fr" as "fr" | "en" }));
vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({locale: language.locale, t: (key: string, vars?: Record<string, string | number>) => translate(language.locale, key, vars)}),
}));
import { Marketing } from "@/components/Marketing";
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("premium product landing", () => {
  it.each(["fr", "en"] as const)("removes only the campaign connection card in %s without a placeholder", (locale) => {
    language.locale = locale;
    try {
      const container = new JSDOM(renderToStaticMarkup(<Marketing />)).window.document.body;
      expect(container.querySelector(".campaign-channels")).toBeNull();
      expect(container.textContent).not.toContain(translate(locale, "sweep1.text123"));
      expect(container.textContent).not.toContain(translate(locale, "sweep1.text126"));
      const heading = container.querySelector(".problem-section-head")!;
      expect(heading.textContent).toContain(translate(locale, "landing.problem.paragraph"));
      expect(heading.nextElementSibling?.className).toBe("problem-grid");
      const cards = container.querySelectorAll(".problem-grid .problem-item");
      expect(cards).toHaveLength(3);
      cards.forEach((card, index) => {
        expect(card.textContent).toContain(translate(locale, `landing.problem.p${index + 1}Title`));
        expect(card.textContent).toContain(translate(locale, `landing.problem.p${index + 1}`));
      });
      expect(container.querySelector("#comment")).not.toBeNull();
    } finally {
      language.locale = "fr";
    }
  });
  it("renders accurate French capabilities and the precise trial offer", () => {
    language.locale = "fr";
    const container = new JSDOM(renderToStaticMarkup(<Marketing />)).window.document.body;
    const hero = container.querySelector(".digital-hero")!;
    expect(hero.textContent).toMatch(/publicit/i);
    expect(hero.textContent).toMatch(/image/i);
    expect(hero.textContent).toMatch(/données disponibles/i);
    expect(hero.textContent).not.toMatch(/vidéo|pub lancée|sans repayer/i);
    expect(container.textContent).toContain("5 jours d’essai · 100 crédits Studio offerts à l'inscription");
    expect(container.textContent).toContain("Lancer mon essai gratuit");
    expect(container.textContent).toContain("Découvrir comment ça marche");
    const heroActions = container.querySelector(".landing-hero-actions")!;
    expect(heroActions.querySelector('a[href="/register"]')?.textContent).toContain("Lancer mon essai gratuit");
    expect(heroActions.querySelector('a[href="#apercu"]')?.textContent).toContain("Découvrir comment ça marche");
    const fr = source("lib/i18n/translations/fr.ts");
    expect(fr).toContain("La génération vidéo n’est pas disponible actuellement.");
    expect(fr).toContain("Les crédits Studio et le budget publicitaire sont distincts de l’abonnement.");
  });
  it("renders an accessible four-scene carousel with verified store and campaign labels", () => {
    const html = renderToStaticMarkup(<Marketing />);
    const container = new JSDOM(html).window.document.body;
    const visual = container.querySelector(".digital-hero figure.digital-workspace[aria-labelledby][aria-describedby], .digital-hero .creator-stage[role='group'][aria-label]");
    expect(visual).not.toBeNull();
    const visualText = visual!.textContent ?? "";
    const visualMarkup = visual!.outerHTML;
    expect(visualMarkup).toMatch(/chariow/i);
    expect(visualMarkup).not.toMatch(/shopify/i);
    expect(visualMarkup).toMatch(/vendeo/i);
    expect(visualText).toContain("Meta");
    expect(visualText).toContain("Pinterest");
    expect(visualText).toContain("TikTok");
    expect(visualText).toContain("Connecte ta boutique Chariow");
    expect(visualText).toContain("Le parcours Vendeo");
    expect(visualText).toContain("données de démonstration");
    expect(visual!.querySelector('[role="region"][aria-roledescription="carrousel"]')).not.toBeNull();
    expect(visual!.querySelectorAll("button")).toHaveLength(0);
    const overlay = visual!.querySelector(".story-photo .story-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay!.textContent).toContain("LE PARCOURS VENDEO");
    expect(overlay!.textContent).toContain("ÉTAPE 1 SUR 4");
    expect(overlay!.querySelector("h3")?.textContent).toBe("Connecte ta boutique Chariow");
    expect(overlay!.querySelector("p")?.textContent).toContain("produits et commandes disponibles");
    expect(visual!.querySelector(".story-content")).toBeNull();
    expect(visual!.querySelector(".story-screenshot img")).not.toBeNull();
    expect(visual!.querySelector(".story-photo img")?.getAttribute("alt")).toMatch(/même créatrice/i);
    const visualSource = source("components/DigitalWorkspaceVisual.tsx");
    expect(visualSource).toContain("flow-story-04.webp");
    expect(visualSource).toContain("performance-visuel-desktop.webp");
    expect(visualSource).toContain("performance-visuel-mobile.webp");
    expect(visualSource).toContain("sans chiffre d’exemple");
    expect(visualSource).not.toMatch(/flow-story-05|assistant IA|video|vidéo|Shopify/i);
    expect(visualSource).toContain("window.setInterval");
    expect(visualSource).toContain("SCENE_DURATION_MS = 4000");
    const visualCss = source("app/landing-digital-hero.css");
    expect(visualCss).toContain("width: min(62%, 520px)");
    expect(visualCss).toContain("width: min(70%, 370px)");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain("claim1minute");
    expect(html).not.toContain("1 minute");
  });
  it("keeps the product section accessible without carousel interaction or timer", () => {
    const src = source("components/Marketing.tsx");
    expect(src).not.toContain("PlatformRotator");
    expect(src).not.toContain("activeDemo");
    expect(src).not.toContain("setInterval");
    expect(renderToStaticMarkup(<Marketing />)).toContain('id="apercu"');
  });
  it("keeps the platform marquee scrolling without a pause control or pause-on-touch", () => {
    const marquee = source("components/PlatformMarquee.tsx");
    const css = source("app/platform-marquee.css");
    expect(marquee).not.toContain("platform-marquee-toggle");
    expect(marquee).not.toContain("setPaused");
    expect(css).not.toContain("animation-play-state: paused");
    expect(css).toContain("22s linear infinite");
  });
});
