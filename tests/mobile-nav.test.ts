import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/mobile-nav.css", import.meta.url), "utf8");
const dashboardCss = readFileSync(new URL("../app/styles/navigation-mobile.css", import.meta.url), "utf8");
const navStart = dashboard.indexOf('<nav className={`mobile-nav');
const navMarkup = dashboard.slice(navStart, dashboard.indexOf("</nav>", navStart));
const sectionMarkup = readFileSync(new URL("../components/dashboard/sections.tsx", import.meta.url), "utf8");
const campaignRecommendationMarkup = readFileSync(new URL("../components/dashboard/CampaignPerformanceTab.tsx", import.meta.url), "utf8");

describe("mobile dashboard navigation", () => {
  it("keeps the five requested destinations in order, with Assistant and Recommendation in the dock", () => {
    const buttons = [...navMarkup.matchAll(/<button\b[\s\S]*?<\/button>/g)].map(([button]) => button);
    expect(buttons).toHaveLength(5);
    expect(buttons.map((button) => button.match(/data-onboarding="([^"]+)"/)?.[1])).toEqual([
      "Vue d'ensemble", "Pub", "Vendeo AI", "Studio", "Performance publicitaire",
    ]);
    expect(buttons[0]).toContain('onClick={() => setActive("Vue d\'ensemble")');
    for (const button of buttons.slice(1)) expect(button).toContain("onClick={() => navigateToSection(");
    expect(buttons[0]).toContain('locale === "en" ? "Home" : "Accueil"');
    expect(buttons[1]).toContain('locale === "en" ? "Ads" : "Pub"');
    expect(buttons[2]).toContain('locale === "en" ? "Assistant" : "Assistant"');
    expect(buttons[2]).toContain("nav-btn-assistant");
    expect(buttons[2]).toContain("<Brain size={26} strokeWidth={2}");
    expect(buttons[2]).toContain('navigateToSection("Vendeo AI")');
    expect(buttons[3]).toContain('className={`nav-btn nav-btn-studio');
    expect(buttons[3]).toContain('<Palette size={24} strokeWidth={2}');
    expect(buttons[3]).toContain('locale === "en" ? "Studio" : "Studio"');
    expect(buttons[4]).toContain('locale === "en" ? "Recommendations" : "Recommandation"');
    expect(buttons[4]).toContain("hasNewRecommendation");
    expect(buttons[4]).toContain("nav-btn-has-notification");
    expect(buttons.slice(0, 4).every((button) => !button.includes("nav-btn-has-notification"))).toBe(true);
    expect(buttons[4]).toContain('navigateToSection("Performance publicitaire")');
    expect(navMarkup).toContain('aria-label={w("mobileNav")}');
    expect(navMarkup.match(/type="button"/g)).toHaveLength(5);
    expect(navMarkup).toContain("mobile-nav-visible");
    expect(navMarkup).toContain("mobile-nav-hidden");
    expect(navMarkup).not.toContain("Visuels");
    expect(navMarkup).not.toContain("Visuals");
    expect(navMarkup).not.toContain("ImageIcon");
  });

  it("removes the floating Assistant bubble and the Visuals section from the visible dashboard", () => {
    expect(dashboard).not.toContain("mobile-assistant-bubble");
    expect(dashboard).not.toContain("PerformanceVisuelView");
    expect(css).not.toContain("mobile-assistant-bubble");
    expect(css).not.toContain("mobile-assistant-hidden-on-stores");
  });

  it("removes the old Studio idea cards while preserving the campaign recommendation path", () => {
    expect(dashboard).not.toContain("openStudioWithPerformanceIdeas");
    expect(sectionMarkup).not.toContain("studio-performance-ideas");
    expect(sectionMarkup).not.toContain("3 idées Studio");
    expect(campaignRecommendationMarkup).toContain("/api/creative-performance/ideas");
    expect(campaignRecommendationMarkup).toContain("creativePerformanceSource");
  });

  it("styles a translucent five-item dock with the raised Assistant button and compact recommendation label", () => {
    expect(css).toContain("border-radius: 34px");
    expect(css).toContain("background: rgba(255, 255, 255, 0.72)");
    expect(css).toContain("backdrop-filter: blur(22px) saturate(180%)");
    expect(css).toContain("border: 1px solid rgba(255, 255, 255, 0.94)");
    expect(css).toContain("inset 0 1px 0 rgba(255, 255, 255, 0.98)");
    expect(css).toContain(".dashboard-platform .mobile-nav .nav-btn-assistant svg");
    expect(css).not.toContain(".dashboard-platform .mobile-nav .nav-btn-studio svg");
    expect(css).toContain("top: -18px");
    expect(css).toContain("transform: translateX(-50%)");
    expect(css).toContain(".dashboard-platform .mobile-nav .nav-btn-recommendation span");
    expect(css).toContain("text-overflow: ellipsis");
    expect(css).not.toContain("nav-btn:nth-child(4) svg");
  });

  it("keeps 24px destination icons, raised Assistant sizing, safe-area clearance and narrow-screen support", () => {
    expect(navMarkup.match(/<(Grid2X2|Megaphone|Palette|BarChart3) size=\{24\} strokeWidth=\{2\}/g)).toHaveLength(4);
    expect(navMarkup).toContain('<Brain size={26} strokeWidth={2}');
    const iconsRule = css.match(/\.dashboard-platform \.mobile-nav \.nav-btn svg \{([^}]*)\}/)?.[1] ?? "";
    expect(iconsRule).toContain("height: 24px;");
    expect(iconsRule).toContain("width: 24px;");
    expect(iconsRule).toContain("stroke-width: 2;");
    const assistantIconRule = css.match(/\.dashboard-platform \.mobile-nav \.nav-btn-assistant svg \{([^}]*)\}/)?.[1] ?? "";
    expect(assistantIconRule).toContain("height: 26px;");
    expect(assistantIconRule).toContain("width: 26px;");
    const mobileWidths = [320, 360, 375, 390, 760];
    for (const width of mobileWidths) expect(width).toBeLessThanOrEqual(760);
    expect(768).toBeGreaterThan(760);
    expect(css.match(/@media \(max-width: 760px\)/g)).toHaveLength(1);
    expect(css.match(/@media \(max-width: 360px\)/g)).toHaveLength(1);
    expect(css).toContain("left: max(10px, env(safe-area-inset-left, 0px))");
    expect(css).toContain("right: max(10px, env(safe-area-inset-right, 0px))");
    expect(css).toContain("bottom: calc(10px + env(safe-area-inset-bottom, 0px))");
    expect(css).not.toContain("bottom: calc(96px");
    expect(css).toContain("min-height: 66px");
    expect(Number(css.match(/min-height: (\d+)px/)?.[1])).toBeGreaterThanOrEqual(44);
    expect(dashboardCss).toContain("padding: 20px 14px calc(92px + env(safe-area-inset-bottom))");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("pointer-events: none");
  });
});
