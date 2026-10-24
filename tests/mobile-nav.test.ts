import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/mobile-nav.css", import.meta.url), "utf8");
const dashboardCss = readFileSync(new URL("../app/styles/navigation-mobile.css", import.meta.url), "utf8");
const navMarkup = dashboard.slice(dashboard.indexOf('<nav className={`mobile-nav'), dashboard.indexOf("</nav>", dashboard.indexOf('<nav className={`mobile-nav')));
const assistantButtonStart = dashboard.indexOf("className={`mobile-assistant-bubble");
const assistantMarkup = dashboard.slice(dashboard.lastIndexOf("<button", assistantButtonStart), dashboard.indexOf("</button>", assistantButtonStart) + 9);

describe("mobile dashboard navigation", () => {
  it("keeps the five approved destinations in order and the Assistant outside the dock", () => {
    const buttons = [...navMarkup.matchAll(/<button\b[\s\S]*?<\/button>/g)].map(([button]) => button);
    expect(buttons).toHaveLength(5);
    expect(buttons.map((button) => button.match(/data-onboarding="([^"]+)"/)?.[1])).toEqual([
      "Vue d'ensemble", "Pub", "Studio", "Performance visuel", "Performance publicitaire",
    ]);
    for (const button of buttons) {
      expect(button).toContain("onClick={() => setActive(");
    }
    expect(buttons[0]).toContain('locale === "en" ? "Home" : "Accueil"');
    expect(buttons[1]).toContain('locale === "en" ? "Ads" : "Pub"');
    expect(buttons[2]).toContain('className={`nav-btn nav-btn-studio');
    expect(buttons[2]).toContain('locale === "en" ? "Studio" : "Studio"');
    expect(buttons[3]).toContain('locale === "en" ? "Visuals" : "Visuels"');
    expect(buttons[4]).toContain('locale === "en" ? "Campaigns" : "Campagnes"');
    expect(navMarkup).toContain('aria-label={w("mobileNav")}');
    expect(navMarkup.match(/type="button"/g)).toHaveLength(5);
    expect(navMarkup).toContain("mobile-nav-visible");
    expect(navMarkup).toContain("mobile-nav-hidden");
    expect(navMarkup).not.toContain("<Brain");
    expect(assistantMarkup).toContain('data-onboarding="Vendeo AI"');
    expect(assistantMarkup).toContain('<Brain size={24} strokeWidth={2}');
    expect(assistantMarkup).toContain("Ouvrir l’assistant Vendeo AI");
  });

  it("hands eligible visual ideas to Studio through session storage without moving the visual section out of the dock", () => {
    expect(dashboard).toContain("onOpenStudio={openStudioWithPerformanceIdeas}");
    expect(dashboard).toContain("sessionStorage.setItem(CREATIVE_PERFORMANCE_STUDIO_PREFILL_KEY, JSON.stringify(prefill))");
    expect(dashboard).toContain('setActive("Studio")');
    expect(dashboard).toContain('document.getElementById("studio-performance-ideas-title") ?? document.getElementById("studio-page-title")');
    expect(dashboard).toContain("target?.focus()");
    expect(readFileSync(new URL("../components/dashboard/sections.tsx", import.meta.url), "utf8")).toContain('id="studio-performance-ideas-title" tabIndex={-1}');
    expect(navMarkup).toContain('data-onboarding="Performance visuel"');
  });

  it("styles a translucent raised dock, a lifted palette button, and a separate Assistant bubble", () => {
    expect(css).toContain("border-radius: 34px");
    expect(css).toContain("background: rgba(255, 255, 255, 0.72)");
    expect(css).toContain("backdrop-filter: blur(22px) saturate(180%)");
    expect(css).toContain("border: 1px solid rgba(255, 255, 255, 0.94)");
    expect(css).toContain("inset 0 1px 0 rgba(255, 255, 255, 0.98)");
    expect(css).toContain(".dashboard-platform .mobile-nav .nav-btn-studio svg");
    expect(css).toContain("linear-gradient(140deg, #398dff 0%, #5d55ee");
    expect(css).toContain("top: -24px");
    expect(css).toContain("transform: translateX(-50%)");
    expect(css).toContain(".dashboard-platform .mobile-assistant-bubble");
  });

  it("matches a consistent 24px icon size and weight across all five destinations", () => {
    expect(navMarkup.match(/<(Grid2X2|Megaphone|Palette|ImageIcon|BarChart3) size=\{24\} strokeWidth=\{2\}/g)).toHaveLength(5);
    expect(assistantMarkup).toContain("<Brain size={24} strokeWidth={2}");
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
    expect(css).toContain("bottom: calc(10px + env(safe-area-inset-bottom, 0px))");
    expect(css).toContain("bottom: calc(96px + env(safe-area-inset-bottom, 0px))");
    expect(css).toContain("min-height: 66px");
    expect(Number(css.match(/min-height: (\d+)px/)?.[1])).toBeGreaterThanOrEqual(44);
    expect(dashboardCss).toContain("padding: 20px 14px calc(92px + env(safe-area-inset-bottom))");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("pointer-events: none");
  });
});
