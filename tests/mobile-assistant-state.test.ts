import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
const mobileCss = readFileSync(new URL("../app/mobile-nav.css", import.meta.url), "utf8");
const navStart = dashboard.indexOf('<nav className={`mobile-nav');
const navMarkup = dashboard.slice(navStart, dashboard.indexOf("</nav>", navStart));

describe("mobile Assistant dock destination", () => {
  it("uses the brain icon and opens the Assistant as a normal dock destination", () => {
    const button = [...navMarkup.matchAll(/<button\b[\s\S]*?<\/button>/g)]
      .map(([markup]) => markup)
      .find((markup) => markup.includes('data-onboarding="Vendeo AI"'));
    expect(button).toBeTruthy();
    expect(button).toContain("<Brain size={24} strokeWidth={2}");
    expect(button).toContain('setActive("Vendeo AI")');
    expect(button).toContain('active === "Vendeo AI"');
    expect(dashboard).not.toContain("mobile-assistant-bubble");
    expect(mobileCss).not.toContain("mobile-assistant-bubble");
    expect(mobileCss).not.toContain("linear-gradient(140deg, #398dff");
  });

  it("highlights the actual dock button only while the Assistant guide step is active", () => {
    const button = [...navMarkup.matchAll(/<button\b[\s\S]*?<\/button>/g)]
      .map(([markup]) => markup)
      .find((markup) => markup.includes('data-onboarding="Vendeo AI"'));
    expect(button).toContain('guideAssistantHighlight ? " nav-btn-guide-highlight" : ""');
    expect(dashboard).toContain('setGuideAssistantHighlight(step.id === "assistant")');
    expect(mobileCss).toContain(".dashboard-platform .mobile-nav .nav-btn.nav-btn-guide-highlight");
    expect(mobileCss).toContain("outline: 3px solid #6b45e8;");
  });

  it("keeps normal dock destination colors and a raised Studio icon", () => {
    expect(mobileCss).toMatch(/\.dashboard-platform \.mobile-nav \.nav-btn\s*\{[\s\S]*?color:\s*#08090c;/);
    expect(mobileCss).toMatch(/\.dashboard-platform \.mobile-nav \.nav-btn\.active\s*\{[\s\S]*?color:\s*#103ef8;/);
    expect(mobileCss).toContain(".dashboard-platform .mobile-nav .nav-btn-studio svg");
    expect(mobileCss).toContain(".dashboard-platform .mobile-nav .nav-btn-studio.active svg");
  });
});
