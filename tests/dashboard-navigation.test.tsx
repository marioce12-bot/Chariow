import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({ t: (key: string) => `translated:${key}` }),
}));

import { DashboardHeaderNavigation, DashboardPrimaryNavigation } from "@/components/dashboard/DesktopNavigation";

describe("dashboard desktop navigation", () => {
  it("keeps primary navigation to its nine destinations", () => {
    const html = renderToStaticMarkup(<DashboardPrimaryNavigation active="Vue d'ensemble" onChange={() => {}} />);
    expect((html.match(/<button/g) ?? []).length).toBe(9);
    expect(html).toContain("translated:nav.overview");
    expect(html).toContain("Bénéfices nets");
    expect(html).toContain("Relances WhatsApp");
    expect(html).toContain("translated:nav.autopilot");
    expect(html).not.toContain("nav.stores");
    expect(html).not.toContain("nav.adAccounts");
    expect(html).not.toContain("nav.subscription");
    expect(html).not.toContain("nav.settings");
    expect(html).not.toContain("admin");
    expect(html).not.toContain(">X<");
  });

  it("shows the four secondary tools with short labels, button semantics and active state", () => {
    const html = renderToStaticMarkup(<DashboardHeaderNavigation active="Comptes publicitaires" onChange={() => {}} />);
    expect((html.match(/<button/g) ?? []).length).toBe(4);
    expect(html).toContain("Boutiques");
    expect(html).toContain("Comptes pub");
    expect(html).toContain("Abonnement");
    expect(html).toContain("Paramètres");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('type="button"');
    expect(html).toContain('class="dashboard-header-navigation"');
    expect(html).not.toContain("admin");
    expect(html).not.toContain(">X<");
  });

  it("uses an explicit accessible label for primary navigation and marks active buttons", () => {
    const html = renderToStaticMarkup(<DashboardPrimaryNavigation active="Studio" onChange={() => {}} />);
    expect(html).toContain('aria-label="Navigation principale du tableau de bord"');
    expect(html).toContain('class="side-link"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("keeps compact header buttons accessible when their visible text is hidden", () => {
    const html = renderToStaticMarkup(<DashboardHeaderNavigation active="Paramètres" onChange={() => {}} />);
    expect(html).toContain('aria-label="Paramètres"');
    expect(html).toContain('title="Paramètres"');
    expect(html).toContain('<span>Paramètres</span>');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("integrates both navigation regions and scopes desktop layout away from admin and mobile", () => {
    const source = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../app/dashboard-navigation.css", import.meta.url), "utf8");
    expect(source).toContain('<DashboardHeaderNavigation active={active} onChange={setActive} />');
    expect(source).toContain('<DashboardPrimaryNavigation active={active} onChange={setActive} />');
    expect(source).toContain('aria-label="Navigation mobile"');
    expect(css).toContain('@media (min-width: 761px)');
    expect(css).toContain('.dashboard-platform .app-layout .sidebar');
    expect(css).toContain('position: fixed');
    expect(css).toMatch(/\.dashboard-platform\.dashboard-assistant-active\s*>\s*\.app-header\s*\{\s*display:\s*none;\s*\}/);
    expect(css).not.toContain('.admin-');
  });
});
