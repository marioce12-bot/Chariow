import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { PLAN_CONFIG } from "@/lib/plans";

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

import { AdsView, MobileSettingsView } from "@/components/dashboard/sections";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("X integration removal", () => {
  it("keeps Meta, TikTok and Pinterest in settings without X or its error", () => {
    const html = renderToStaticMarkup(
      <MobileSettingsView onNavigate={vi.fn()} onSignOut={vi.fn()} plan="starter" focus="channels" />,
    );
    expect(html).toContain("Meta (Facebook &amp; Instagram)");
    expect(html).toContain("TikTok");
    expect(html).toContain("Pinterest");
    expect(html).not.toContain("X Ads");
    expect(html).not.toContain("Connexion X autorisée");
    expect(html).not.toContain('aria-label="X"');
  });

  it("removes the X tab from the advertising space", () => {
    const html = renderToStaticMarkup(<AdsView plan="starter" onLaunchAd={vi.fn()} onGoToAI={vi.fn()} onGoToAccounts={vi.fn()} storeId={null} campaignsVersion={0} />);
    expect(html).toContain('aria-label="ads.meta"');
    expect(html).toContain('aria-label="ads.tiktok"');
    expect(html).toContain('aria-label="Pinterest"');
    expect(html).not.toContain("X Ads");
  });

  it("does not fetch X accounts or handle legacy X OAuth status", () => {
    const sections = source("components/dashboard/sections.tsx");
    expect(sections).not.toContain("/api/integrations/x/");
    expect(sections).not.toContain("loadXAccounts");
    expect(sections).not.toContain("Connexion X autorisée");
    expect(source("components/Dashboard.tsx")).not.toContain('searchParams.get("x")');
    expect(PLAN_CONFIG.starter.adPlatforms).not.toContain("x");
  });

  it("has no executable X API routes or client implementation", () => {
    for (const path of ["app/api/integrations/x", "lib/x"]) {
      expect(existsSync(new URL(`../${path}`, import.meta.url))).toBe(false);
    }
    expect(source(".env.example")).not.toMatch(/^X_(API|ADS)_/m);
  });
});
