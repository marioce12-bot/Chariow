import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("mobile dashboard shell layout", () => {
  it("keeps store selection inside overview and restores normal header compensation", () => {
    const source = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
    const overview = readFileSync(new URL("../components/dashboard/OverviewHome.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../app/dashboard-navigation.css", import.meta.url), "utf8");
    const header = source.indexOf('<header className="app-header">');
    const layout = source.indexOf('<div className={`app-layout');
    expect(header).toBeGreaterThan(-1);
    expect(header).toBeLessThan(layout);
    expect(source).not.toContain("<DashboardStoreSelector mobile");
    expect(source).toContain("storeSelector={<DashboardStoreSelector");
    expect(source.indexOf("storeSelector={<DashboardStoreSelector")).toBeGreaterThan(source.indexOf('{active === "Vue d\'ensemble" ? ('));
    expect(overview).toContain("{storeSelector}");
    expect(css).not.toMatch(/dashboard-platform\s*>\s*\.app-layout\s*\{[^}]*padding-top:\s*0/);
    expect(css).toMatch(/padding-top:\s*calc\([\s\S]*var\(--dashboard-header-height\)/);
    expect(css).not.toContain("dashboard-mobile-store-switcher");
    expect(css).toMatch(/\.dashboard-platform\.dashboard-assistant-active\s*>\s*\.app-header\s*\{\s*display:\s*none;\s*\}/);
    expect(source).toContain('" app-layout-flush"');
    const aiCss = readFileSync(new URL("../app/vendeo-ai.css", import.meta.url), "utf8");
    expect(aiCss).toContain(".app-layout-flush ~ .mobile-nav");
  });
});
