import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { AnimatedHeroTitle } from "@/components/AnimatedHeroTitle";
import { translate } from "@/lib/i18n/translate";

describe("animated hero letters", () => {
  it.each(["fr", "en"] as const)("keeps the complete %s heading accessible and words unbroken", locale => {
    const first = translate(locale, "landing.hero.title1"), second = translate(locale, "landing.hero.title2"), last = translate(locale, "landing.hero.title3");
    const html = renderToStaticMarkup(<AnimatedHeroTitle first={first} second={second} last={last} />);
    expect(html).toContain('class="hero-title-gradient hero-title-animated"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="hero-title-word"');
    expect(html).toContain('class="hero-title-letter"');
    expect(html).toContain('aria-label=');
    expect(html).toContain('--letter-delay:0ms');
    expect(html).not.toContain('undefined');
  });
  it("only runs the entrance when motion is allowed, with no endless looping", () => {
    const css = readFileSync("app/landing-premium.css", "utf8");
    expect(css).toContain("@media (prefers-reduced-motion: no-preference)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation:heroLetterEntrance .65s");
    expect(css).toContain("white-space:nowrap");
    expect(css).not.toMatch(/heroLetterEntrance[^;]*infinite/);
  });
});
