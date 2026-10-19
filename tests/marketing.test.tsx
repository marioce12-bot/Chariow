import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { translate } from "@/lib/i18n/translate";
vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({locale: "fr", t: (key: string, vars?: Record<string, string | number>) => translate("fr", key, vars)}),
}));
import { Marketing } from "@/components/Marketing";
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("premium product landing", () => {
  it("renders a public demo clearly labelled, with no creator testimonials", () => {
    const html = renderToStaticMarkup(<Marketing />);
    expect(html).toContain(translate("fr", "sweep1.text120"));
    expect(translate("fr", "sweep1.text120")).toContain("données de démonstration");
    expect(html).toContain('id="apercu"');
    expect(html).toContain('role="region"');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain("carousel-controls");
    expect(html).toContain('href="/register"');
    expect(html).toContain('href="/login"');
    expect(html).not.toContain("proof-carousel");
    expect(html).not.toContain("creators-marquee");
    expect(source("app/page.tsx")).not.toContain("getProofImages");
  });
  it("uses localized authentic screenshot assets and descriptive alt text", () => {
    const marketing = source("components/Marketing.tsx");
    expect(marketing).toContain('actual-${["home", "ads", "studio"][activeDemo]}-${isEnglish ? "en" : "fr"}.webp');
    expect(marketing).not.toContain("MarketingProductPreview");
    expect(marketing).toContain("Capture réelle de l’écran de lancement de publicités Vendeo");
    expect(marketing).toContain("Authentic screenshot of Vendeo AI Studio");
    expect(marketing).not.toContain("dashboard-demo.webp");
  });
  it("supports mobile login, a localized accessible carousel that loops without pausing, and reduced-motion", () => {
    const src = source("components/Marketing.tsx");
    expect(src).toContain('aria-controls="landing-navigation"');
    expect(src).toContain('"ArrowLeft", "ArrowRight", "Home", "End"');
    expect(src).toContain('fr: "Accueil", en: "Home"');
    expect(src).toContain('fr: "Lancement de publicités", en: "Launch ads"');
    expect(src).toContain('fr: "Studio IA", en: "AI Studio"');
    expect(src).toContain("window.setTimeout");
    expect(src).toContain("}, [activeDemo]);");
    expect(src).not.toContain("setCarouselHovered");
    expect(src).not.toContain("setCarouselFocused");
    expect(src).toContain("onTouchStart=");
    expect(src).toContain("onTouchEnd=");
    expect(src).toContain("tabIndex={0}");
    expect(src).not.toContain("aria-pressed");
    expect(src).not.toContain("carousel-controls");
    expect(src).toContain('className="marketing-actions"');
    expect(src).toContain('!("IntersectionObserver" in window)');
    const css = source("app/landing-premium.css");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain("animation:none!important");
    expect(css).toContain(".landing-reveal{opacity:1;transform:none}");
    expect(css).toContain("@keyframes lpSlideIn");
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
