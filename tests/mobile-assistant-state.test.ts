import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboard = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
const mobileCss = readFileSync(new URL("../app/mobile-nav.css", import.meta.url), "utf8");

describe("mobile assistant navigation colors", () => {
  it("keeps inactive destinations black and active destinations blue", () => {
    const css = readFileSync(new URL("../app/dashboard-refinement.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.dashboard-platform \.mobile-nav \.nav-btn\s*\{\s*color:\s*#08090c;/);
    expect(css).toMatch(/\.dashboard-platform \.mobile-nav \.nav-btn\.active\s*\{\s*color:\s*#103ef8;/);
    expect(mobileCss).toContain("color: #08090c;");
    expect(mobileCss).toContain("color: #103ef8;");
    expect(mobileCss).not.toContain(".nav-btn-assistant");
    const notificationsCss = readFileSync(new URL("../app/styles/notifications.css", import.meta.url), "utf8");
    expect(notificationsCss).not.toContain(".nav-btn-assistant");
  });

  it("uses a standalone gradient brain bubble and a raised palette for Studio", () => {
    const rules = [...mobileCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const bubbleRules = rules.filter((rule) => rule[1].trim() === ".dashboard-platform .mobile-assistant-bubble");
    const bubble = bubbleRules[bubbleRules.length - 1]?.[2] ?? "";
    expect(bubble).toContain("linear-gradient(140deg, #398dff");
    expect(bubble).toContain("color: #fff;");
    expect(dashboard).toContain('data-onboarding="Vendeo AI"');
    expect(dashboard).toContain('<Brain size={24} strokeWidth={2}');
    expect(dashboard).toContain("mobile-assistant-bubble");
    expect(mobileCss).toContain(".dashboard-platform .mobile-nav .nav-btn-studio svg");
    expect(mobileCss).toContain(".dashboard-platform .mobile-nav .nav-btn-studio.active svg");
  });
});
