import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/mobile-nav.css", import.meta.url), "utf8");
const dashboardCss = readFileSync(new URL("../app/styles/navigation-mobile.css", import.meta.url), "utf8");
const navMarkup = dashboard.slice(dashboard.indexOf('<nav className={`mobile-nav'), dashboard.indexOf("</nav>", dashboard.indexOf('<nav className={`mobile-nav')));

describe("mobile dashboard navigation", () => {
  it("keeps four primary destinations, translated labels, and click handlers", () => {
    const buttons = [...navMarkup.matchAll(/<button\b[\s\S]*?<\/button>/g)].map(([button]) => button);
    expect(buttons).toHaveLength(4);
    expect(buttons.map((button) => button.match(/data-onboarding="([^"]+)"/)?.[1])).toEqual([
      "Vue d'ensemble", "Pub", "Vendeo AI", "Studio",
    ]);
    for (const [index, key] of ["nav.overview", "nav.pubs", "nav.assistant", "nav.studio"].entries()) {
      expect(buttons[index]).toContain(`t("${key}")`);
      expect(buttons[index]).toContain("onClick={() => setActive(");
    }
    expect(navMarkup).toContain('aria-label={w("mobileNav")}');
    expect(navMarkup.match(/type="button"/g)).toHaveLength(4);
    expect(navMarkup).toContain("mobile-nav-visible");
    expect(navMarkup).toContain("mobile-nav-hidden");
  });

  it("styles a floating, softly bordered dock with a raised blue-violet assistant control", () => {
    expect(css).toContain("border-radius: 22px");
    expect(css).toContain("box-shadow:");
    expect(css).toContain("border: 1px solid rgba(210, 222, 245");
    expect(css).toContain("linear-gradient(140deg, #4386ff 0%, #6559e8");
    expect(css).toContain("top: -22px");
    expect(css).toContain("transform: translateX(-50%)");
    expect(css).toContain("stroke: #fff");
  });

  it("matches a consistent 24px, 2px icon size and weight across all four destinations", () => {
    expect(navMarkup.match(/<(LayoutDashboard|Megaphone|Brain|Sparkles) size=\{24\}/g)).toHaveLength(4);
    expect(navMarkup).toContain("<Brain size={24} strokeWidth={2} />");
    expect(navMarkup).toContain("<Sparkles size={24} strokeWidth={2} />");
    const iconsRule = css.match(/\.dashboard-platform \.mobile-nav \.nav-btn svg \{([^}]*)\}/)?.[1] ?? "";
    expect(iconsRule).toContain("height: 24px;");
    expect(iconsRule).toContain("width: 24px;");
    expect(iconsRule).toContain("stroke-width: 2;");
    expect(css).not.toContain("nav-btn:nth-child(4) svg");
  });

  it("keeps safe-area clearance and usable targets at narrow, standard, and tablet mobile widths", () => {
    const mobileWidths = [320, 360, 375, 390, 760];
    for (const width of mobileWidths) expect(width).toBeLessThanOrEqual(760);
    expect(768).toBeGreaterThan(760);
    expect(css.match(/@media \(max-width: 760px\)/g)).toHaveLength(1);
    expect(css.match(/@media \(max-width: 360px\)/g)).toHaveLength(1);
    expect(css).toContain("left: max(10px, env(safe-area-inset-left, 0px))");
    expect(css).toContain("right: max(10px, env(safe-area-inset-right, 0px))");
    expect(css).toContain("bottom: calc(8px + env(safe-area-inset-bottom, 0px))");
    expect(css).toContain("min-height: 52px");
    expect(Number(css.match(/min-height: (\d+)px/)?.[1])).toBeGreaterThanOrEqual(44);
    expect(dashboardCss).toContain("padding: 20px 14px calc(92px + env(safe-area-inset-bottom))");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("pointer-events: none");
  });
});
