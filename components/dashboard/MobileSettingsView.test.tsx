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

describe("Settings tabs SSR", () => {
  it.each(["fr", "en"] as const)("shows seven translated tabs and only Appearance by default (%s)", (locale) => {
    language.locale = locale;
    const html = render();
    expect(html.match(/role="tab"/g)).toHaveLength(7);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(1);
    expect(html.match(/data-settings-panel=/g)).toHaveLength(1);
    expect(html).toContain('data-settings-panel="appearance"');
    expect(html).toContain(translate(locale, "settings.appearance"));
    expect(html).toContain(translate(locale, "settings.language.title"));
    expect(html).not.toContain('data-settings-panel="language"');
    expect(html).not.toContain("mobile-settings-return");
    expect(html).not.toContain("mobile-settings-index");
  });

  it.each(["accounts", "channels", "appearance", "language", "feedback", "about", "session"] as const)("opens %s directly, with no unrelated sections", (focus) => {
    const html = render(focus);
    expect(html).toContain(`data-mobile-settings-section="${focus}"`);
    expect(html.match(/data-settings-panel=/g)).toHaveLength(1);
    expect(html).toContain(`data-settings-panel="${focus}"`);
    expect(html).toContain(`id="settings-panel-${focus}"`);
    expect(html).toContain(`aria-labelledby="settings-tab-${focus}"`);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).not.toContain("mobile-settings-return");
  });

  it("maps the legacy preferences focus to Appearance without stacking Language", () => {
    expect(render("preferences")).toContain('data-mobile-settings-section="appearance"');
    expect(render("preferences")).not.toContain('data-settings-panel="language"');
  });

  it("uses responsive tabs without CSS-only panel filtering", () => {
    const css = readFileSync(new URL("../../app/settings-mobile.css", import.meta.url), "utf8");
    expect(css).toContain('.settings-tab[aria-selected="true"]');
    expect(css).toContain("repeat(2, minmax(0, 1fr))");
    expect(css).toContain("min-height: 44px");
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
