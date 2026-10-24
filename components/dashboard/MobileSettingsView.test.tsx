import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { translate } from "@/lib/i18n/translate";

const language = vi.hoisted(() => ({ locale: "fr" as "fr" | "en" }));
vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({ locale: language.locale, setLocale: vi.fn(), t: (key: string) => translate(language.locale, key) }),
}));
vi.mock("@/components/TikTokAdsPanel", () => ({ TikTokAdsPanel: () => null }));
vi.mock("@/components/PinterestAdsPanel", () => ({ PinterestAdsPanel: () => null }));
vi.mock("@/components/dashboard/MetaHistoryOverview", () => ({ MetaHistoryOverview: () => null }));
vi.mock("@/components/dashboard/OverviewDetails", () => ({ OverviewDetails: () => null }));
vi.mock("@/components/vendeo", () => ({ CampaignCrossTable: () => null, DiagnosticBoutique: () => null }));
vi.mock("@/components/vendeo/DiagnosticFunnel", () => ({ DiagnosticFunnel: () => null }));
vi.mock("@/components/vendeo/AdCampaignsList", () => ({ AdCampaignsList: () => null }));
vi.mock("@/components/vendeo/AutopilotView", () => ({ AutopilotView: () => null }));
vi.mock("@/components/vendeo/wizard", () => ({ LaunchAdWizard: () => null }));

import { MobileSettingsView, StoresView, SubscriptionView } from "./sections";

function render(focus?: Parameters<typeof MobileSettingsView>[0]["focus"]) {
  return renderToStaticMarkup(<MobileSettingsView onNavigate={vi.fn()} onSignOut={vi.fn()} plan="starter" focus={focus} />);
}

describe("Settings index SSR", () => {
  it.each(["fr", "en"] as const)("shows searchable settings grouped by app and account/store (%s)", (locale) => {
    language.locale = locale;
    const html = render();
    expect(html.match(/class="settings-group"/g)).toHaveLength(2);
    expect(html.match(/class="settings-option-row"/g)).toHaveLength(9);
    expect(html).toContain(`placeholder="${translate(locale, "settings.searchPlaceholder")}"`);
    expect(html).toContain(translate(locale, "settings.appSection"));
    expect(html).toContain(translate(locale, "settings.shopSection"));
    expect(html).toContain(translate(locale, "settings.appearance"));
    expect(html).toContain(translate(locale, "settings.language.title"));
    expect(html).toContain(translate(locale, "notifications.title"));
    expect(html).not.toContain('data-settings-panel="appearance"');
    expect(html).not.toContain('role="tab"');
  });

  it.each(["accounts", "channels", "appearance", "language", "feedback", "about", "session"] as const)("opens %s as a focused detail with a return button", (focus) => {
    const html = render(focus);
    expect(html).toContain(`data-mobile-settings-section="${focus}"`);
    expect(html.match(/data-settings-panel=/g)).toHaveLength(1);
    expect(html).toContain(`data-settings-panel="${focus}"`);
    expect(html).toContain(`id="settings-panel-${focus}"`);
    expect(html).toContain('aria-labelledby="settings-title"');
    expect(html).toContain("settings-detail-back mobile-back-button");
    expect(html).not.toContain('class="settings-index"');
  });

  it("maps the legacy preferences focus to Appearance", () => {
    expect(render("preferences")).toContain('data-mobile-settings-section="appearance"');
    expect(render("preferences")).toContain('data-settings-panel="appearance"');
    expect(render("preferences")).toContain("settings-detail-back");
  });

  it("styles the search and grouped rows without CSS-only filtering", () => {
    const css = readFileSync(new URL("../../app/settings-mobile.css", import.meta.url), "utf8");
    expect(css).toContain(".settings-page .settings-search input");
    expect(css).toContain(".settings-page .settings-option-row");
    expect(css).toContain("grid-template-columns: 24px minmax(0, 1fr) 18px");
    expect(css).toContain("min-height: 54px");
    expect(css).not.toContain("data-mobile-settings-section");
  });
});

describe("Settings detail back navigation", () => {
  it("places Back before the heading in stores and subscription details", () => {
    for (const element of [
      <StoresView stores={[]} subscription={null} onStoresChange={vi.fn()} onBackToSettings={vi.fn()} />,
      <SubscriptionView subscription={null} onBackToSettings={vi.fn()} />,
    ]) {
      const html = renderToStaticMarkup(element);
      expect(html.indexOf("settings-detail-back")).toBeGreaterThan(-1);
      expect(html.indexOf("settings-detail-back")).toBeLessThan(html.indexOf("<h1"));
    }
  });
});
