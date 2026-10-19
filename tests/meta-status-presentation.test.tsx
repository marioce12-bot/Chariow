import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n/translate";

const { localeState, campaignsState } = vi.hoisted(() => ({
  localeState: { locale: "fr" as "fr" | "en" },
  campaignsState: { campaigns: [] as Array<Record<string, unknown>> },
}));

vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({
    locale: localeState.locale,
    t: (key: string, vars?: Record<string, string | number>) => translate(localeState.locale, key, vars),
  }),
}));
vi.mock("@/components/dashboard/NavigationDataCache", () => ({
  useNavigationData: () => ({ data: { campaigns: campaignsState.campaigns }, loading: false }),
  useNavigationCache: () => ({ load: vi.fn() }),
}));
vi.mock("@/components/vendeo/wizard/ResumeCampaignModal", () => ({ ResumeCampaignModal: () => null }));
vi.mock("@/components/vendeo/wizard/LaunchAdWizard", () => ({ LaunchAdWizard: () => null }));

import { AdCampaignsList } from "@/components/vendeo/AdCampaignsList";

const campaign = (id: string, status: string, title: string) => ({
  id, product_id: id, platform: "meta", status, objective: "sales", title,
  daily_budget: 5, duration_days: 5, estimated_budget: 25, external_error: null,
  created_at: "2026-01-01",
});

const campaigns = [
  campaign("active", "active", "LinkedIn-Le Guide pratique pour avoir de l'audience"),
  campaign("preparing", "preparing", "Preparing example"),
  campaign("review", "review", "Review example"),
  campaign("unknown", "mystery_status", "Unknown example"),
];

function render(locale: "fr" | "en", fixture = campaigns) {
  localeState.locale = locale;
  campaignsState.campaigns = fixture;
  return renderToStaticMarkup(createElement(AdCampaignsList, { storeId: "store", onNewCampaign: vi.fn() }));
}

describe("AdCampaignsList Meta status presentation (SSR)", () => {
  it.each([
    ["fr", "Active chez Meta", "Préparation en cours", "En cours d&#x27;examen", "Statut à vérifier"],
    ["en", "Active on Meta", "Preparing", "Under review", "Status to verify"],
  ] as const)("renders distinct localized Meta statuses in %s", (locale, active, preparing, review, unknown) => {
    const html = render(locale, campaigns.slice(0, 3));
    expect(html).toContain(active);
    expect(html).toContain(preparing);
    expect(html).toContain(review);
    expect(render(locale, [campaign("unknown", "unknown", "Unknown example")])).toContain(unknown);
  });

  it.each([
    ["fr", "Active chez Meta", "Préparation en cours"],
    ["en", "Active on Meta", "Preparing"],
  ] as const)("keeps the LinkedIn-titled campaign on Meta with the active badge in %s", (locale, active, preparing) => {
    const html = render(locale, campaigns.slice(0, 1));
    const row = html.split('<div role="button"')[1] ?? html;
    expect(row).toContain("Meta");
    expect(row).toContain("5 $/" + (locale === "en" ? "day" : "j") + " · 5");
    expect(row).toContain(active);
    expect(row).not.toContain(preparing);
  });
});
