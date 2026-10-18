import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { translate } from "@/lib/i18n/translate";
vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({locale: "fr", t: (key: string, vars?: Record<string, string | number>) => translate("fr", key, vars)}),
}));
import { Marketing } from "@/components/Marketing";
import { MarketingProductPreview } from "@/components/MarketingProductPreview";
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("premium product landing", () => {
  it("renders a public demo clearly labelled, with no creator testimonials", () => {
    const html = renderToStaticMarkup(<Marketing />);
    expect(html).toContain(translate("fr", "sweep1.text120"));
    expect(translate("fr", "sweep1.text120")).toContain("données de démonstration");
    expect(html).toContain('id="apercu"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-controls="demo-panel"');
    expect(html).toContain('href="/register"');
    expect(html).toContain('href="/login"');
    expect(html).not.toContain("proof-carousel");
    expect(html).not.toContain("creators-marquee");
    expect(source("app/page.tsx")).not.toContain("getProofImages");
  });
  it("keeps the dashboard screenshot and uses localized real UI mockups for ads and Studio", () => {
    expect(existsSync(new URL("../public/landing/dashboard-demo.webp", import.meta.url))).toBe(true);
    const marketing = source("components/Marketing.tsx");
    expect(marketing).toContain("<MarketingProductPreview");
    expect(marketing).toContain('src="/landing/dashboard-demo.webp"');
    expect(marketing).not.toContain("/landing/profit-demo.webp");
    expect(marketing).not.toContain("/landing/recovery-demo.webp");
    const ad = renderToStaticMarkup(<MarketingProductPreview slide={1} locale="fr" />);
    expect(ad).toContain("Produit sélectionné");
    expect(ad).toContain("Facebook &amp; Instagram");
    expect(ad).toContain("Côte d’Ivoire");
    expect(ad).toContain("DONNÉES DE DÉMO · CAMPAGNE NON ACTIVE");
    expect(ad).toContain("rien n’est publié");
    const studio = renderToStaticMarkup(<MarketingProductPreview slide={2} locale="en" />);
    expect(studio).toContain("AI Studio");
    expect(studio).toContain("Describe the image you want to create");
    expect(studio).toContain("DEMO DATA · NOT A LIVE CAMPAIGN");
    expect(studio).toContain("no campaign or AI generation is running");
  });
  it("supports mobile login, a localized accessible carousel, auto-rotation pause, and reduced-motion", () => {
    const src = source("components/Marketing.tsx");
    expect(src).toContain('aria-controls="landing-navigation"');
    expect(src).toContain('"ArrowLeft", "ArrowRight", "Home", "End"');
    expect(src).toContain('fr: "Accueil", en: "Home"');
    expect(src).toContain('fr: "Lancement de publicités", en: "Launch ads"');
    expect(src).toContain('fr: "Studio IA", en: "AI Studio"');
    expect(src).toContain("window.setInterval");
    expect(src).toContain("onMouseEnter={() => setCarouselHovered(true)}");
    expect(src).toContain("aria-pressed={carouselPaused}");
    expect(src).toContain('className="marketing-actions"');
    expect(src).toContain('!("IntersectionObserver" in window)');
    const css = source("app/landing-premium.css");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain("animation:none!important");
    expect(css).toContain(".landing-reveal{opacity:1;transform:none}");
    expect(css).toContain("@keyframes lpSlideIn");
  });
});
