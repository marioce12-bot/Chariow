import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
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
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-controls="demo-panel"');
    expect(html).toContain('href="/register"');
    expect(html).toContain('href="/login"');
    expect(html).not.toContain("proof-carousel");
    expect(html).not.toContain("creators-marquee");
    expect(source("app/page.tsx")).not.toContain("getProofImages");
  });
  it("uses the three actual, lightweight demonstration screenshots", () => {
    for (const name of ["dashboard-demo", "profit-demo", "recovery-demo"]) {
      expect(existsSync(new URL(`../public/landing/${name}.webp`, import.meta.url))).toBe(true);
      expect(source("components/Marketing.tsx")).toContain(`/landing/${name}.webp`);
    }
  });
  it("supports mobile navigation, keyboard tabs and reduced-motion fallbacks", () => {
    const src = source("components/Marketing.tsx");
    expect(src).toContain('aria-controls="landing-navigation"');
    expect(src).toContain('"ArrowLeft", "ArrowRight", "Home", "End"');
    expect(src).toContain('!("IntersectionObserver" in window)');
    const css = source("app/landing-premium.css");
    expect(css).toContain("@media(prefers-reduced-motion:reduce)");
    expect(css).toContain("animation:none!important");
    expect(css).toContain(".landing-reveal{opacity:1;transform:none}");
  });
});
