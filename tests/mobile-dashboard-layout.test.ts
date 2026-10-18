import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("mobile dashboard shell layout", () => {
  it("reserves the fixed header before the sibling store picker, not again on app-layout", () => {
    const source = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../app/dashboard-navigation.css", import.meta.url), "utf8");

    const header = source.indexOf('<header className="app-header">');
    const picker = source.indexOf("<DashboardStoreSelector mobile");
    const layout = source.indexOf('<div className={`app-layout');
    expect(header).toBeGreaterThan(-1);
    expect(header).toBeLessThan(picker);
    expect(picker).toBeLessThan(layout);

    expect(css).toMatch(/\.dashboard-platform\s*>\s*\.dashboard-mobile-store-switcher\s*\{[^}]*margin:\s*80px 16px 0/);
    expect(css).toMatch(/\.dashboard-platform\s*>\s*\.app-layout\s*\{\s*padding-top:\s*0/);
    expect(css).toMatch(/\.dashboard-platform\.dashboard-is-offline\s*>\s*\.dashboard-mobile-store-switcher\s*\{[^}]*margin-top:\s*124px/);
    expect(css).toMatch(/\.dashboard-platform\s*>\s*\.app-layout\.app-layout-offline:not\(\.app-layout-flush\)\s*\{\s*padding-top:\s*0/);
    expect(css).toMatch(/\.dashboard-platform\.dashboard-assistant-active\s*>\s*\.app-header\s*\{\s*display:\s*none;\s*\}/);
    expect(source).toContain('{active !== "Vendeo AI" && <DashboardStoreSelector mobile');
    expect(source).toContain('" app-layout-flush"');
    const aiCss = readFileSync(new URL("../app/vendeo-ai.css", import.meta.url), "utf8");
    expect(aiCss).toContain(".app-layout-flush ~ .mobile-nav");
  });
});
