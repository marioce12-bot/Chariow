import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("@/lib/i18n/i18n", async () => {
  const { translate } = await import("@/lib/i18n/translate");
  return { useI18n: () => ({ locale: "fr", setLocale: () => {}, t: (key: string, vars?: Record<string, string | number>) => translate("fr", key, vars) }) };
});

import { DashboardHeaderNavigation, DashboardPrimaryNavigation } from "@/components/dashboard/DesktopNavigation";

describe("dashboard desktop navigation", () => {
  it("keeps all eleven primary destinations, including creative performance and feedback", () => {
    const html = renderToStaticMarkup(<DashboardPrimaryNavigation active="Accueil" onChange={() => {}} />);
    expect((html.match(/<button/g) ?? []).length).toBe(11);
    expect(html).toContain("Performance visuel");
    expect(html).toContain("Suggestions et notes");
    expect(html).toContain("Accueil");
    expect(html).toContain("Bénéfices nets");
    expect(html).toContain("Relances WhatsApp");
    expect(html).toContain("Pilotage auto");
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
    const mobileCss = readFileSync(new URL("../app/dashboard-autopilot-header.css", import.meta.url), "utf8");
    expect(source).toContain('<DashboardHeaderNavigation active={active} onChange={setActive} />');
    expect(source).toContain('<DashboardPrimaryNavigation active={active} onChange={setActive} />');
    expect(source).toContain('aria-label={w("mobileNav")}');
    expect(css).toContain('@media (min-width: 761px)');
    expect(css).toContain('.dashboard-platform .app-layout .sidebar');
    expect(css).toContain('position: fixed');
    expect(css).toMatch(/\.dashboard-platform\.dashboard-assistant-active\s*>\s*\.dashboard-workspace\s*>\s*\.app-header\s*\{\s*display:\s*none;\s*\}/);
    expect(css).not.toContain('.admin-');
  });

  it("provides a mobile autopilot header shortcut and keeps other overflow items", () => {
    const source = readFileSync(new URL("../components/Dashboard.tsx", import.meta.url), "utf8");
    const menu = source.slice(source.indexOf('<div className="mobile-more-menu"'), source.indexOf("</div>", source.indexOf('<div className="mobile-more-menu"')));
    const shortcut = source.slice(source.indexOf('className="mobile-autopilot-trigger"'), source.indexOf('</button>', source.indexOf('className="mobile-autopilot-trigger"')));
    const css = readFileSync(new URL("../app/dashboard-autopilot-header.css", import.meta.url), "utf8");
    expect(source).toContain('aria-label={t("workspaceExtra.autopilot")} title={t("workspaceExtra.autopilot")}');
    expect(shortcut).toContain('aria-current={active === "Pilotage auto" ? "page" : undefined}');
    expect(shortcut).toContain('setActive("Pilotage auto"); setMoreOpen(false)');
    expect(menu).not.toContain('workspaceExtra.autopilot');
    for (const item of ['w("netProfit")', 'w("whatsapp")', 'workspaceExtra.reports', 'workspaceExtra.subscription', 'workspaceExtra.settings']) expect(menu).toContain(item);
    expect(css).toContain("@media (max-width: 760px)");
    expect(css).toContain("focus-visible");
    expect(css).toContain('aria-current="page"');
    expect(css).toContain("width: 36px");
  });
});
