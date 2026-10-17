import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, writeFileSync } from "node:fs";

vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({ locale: "fr", setLocale: vi.fn(), t: (key: string) => key }),
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

import { MobileSettingsView } from "./sections";

describe("MobileSettingsView SSR", () => {
  it("renders the five-section index and applies the channels focus attribute", () => {
    const html = renderToStaticMarkup(
      <MobileSettingsView onNavigate={vi.fn()} onSignOut={vi.fn()} onBack={vi.fn()} plan="starter" focus="channels" />,
    );
    const index = html.match(/<nav class="mobile-settings-index"[\s\S]*?<\/nav>/)?.[0] ?? "";
    expect(index.match(/class="mobile-settings-card"/g)).toHaveLength(5);
    expect(html).toContain('data-mobile-settings-section="channels"');
    expect(html).toContain('class="mobile-settings-return"');
    expect(html).toContain('aria-label="settings.backToSections"');
    const css = readFileSync(new URL("../../app/settings-mobile.css", import.meta.url), "utf8");
    expect(css).toContain('.settings-page[data-mobile-settings-section]:not([data-mobile-settings-section="list"]) .settings-head .mobile-back-button { display: none; }');
    expect(css).toContain('.mobile-nav-hidden-on-stores { display: none !important; }');
    expect(css).toContain('.settings-page[data-mobile-settings-section="channels"] > .settings-section:not([data-settings-panel="channels"])');
    expect(css).toContain('.settings-page[data-mobile-settings-section="preferences"] > .settings-section:is([data-settings-panel="accounts"], [data-settings-panel="channels"])');
    const preferences = renderToStaticMarkup(
      <MobileSettingsView onNavigate={vi.fn()} onSignOut={vi.fn()} plan="starter" focus="preferences" />,
    );
    expect(preferences).toContain('data-mobile-settings-section="preferences"');
    expect(css).toContain('.settings-page[data-mobile-settings-section="preferences"]');
    expect(css).toContain('.settings-page .settings-section-theme .theme-choice-grid');
    writeFileSync("/tmp/vendeo-settings-check.html", `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><main>${html}</main></body></html>`);
  });
});
