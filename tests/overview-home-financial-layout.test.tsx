import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/vendeo/AdCampaignsList", () => ({
  AdCampaignsList: () => <section data-testid="campaigns">Campagnes</section>,
}));
vi.mock("@/components/dashboard/DailyMotivationalQuote", () => ({ DailyMotivationalQuote: () => null }));
vi.mock("@/components/dashboard/NavigationDataCache", () => ({
  useNavigationData: () => ({ data: { campaigns: [], packs: [], alerts: [] }, loading: false, error: null }),
  useNavigationCache: () => ({ subscribe: () => () => {}, snapshot: () => ({ loading: false, refreshing: false, error: false }) }),
}));

import { OverviewHome } from "@/components/dashboard/OverviewHome";
import { I18nProvider } from "@/lib/i18n/i18n";

describe("home financial layout", () => {
  it("renders gross sales and net profit first, while retaining expenses, Chariow events and catalogue", () => {
    const analytics = {
      products: [{ id: "book-1", name: "Produit de test", price: 100, currency: "USD", image: null }],
      sales: [{ id: "sale-1", product_id: "book-1", product_name: "Produit de test", status: "completed", amount: 100, currency: "USD", occurred_at: new Date().toISOString() }],
      kpis: { sales: 1, period: { from: null, to: null } },
      overview: { currency: "USD", revenueGross: 100, revenueNet: 85, sales: 1, averageBasket: 85 },
    };
    const html = renderToStaticMarkup(<I18nProvider><OverviewHome
      stores={[{ id: "store-1", platform: "chariow", store_name: "Boutique test" } as any]}
      subscription={null}
      analytics={analytics as any}
      rolling30Analytics={analytics as any}
      selectedPeriodAnalytics={analytics as any}
      userFirstName="Test"
      plan={"standard" as any}
      selectedStoreId="store-1"
      onLaunchAd={() => {}}
      campaignsVersion={0}
    /></I18nProvider>);
    const document = new JSDOM(html).window.document;
    const grid = document.querySelector(".ov-kpi-grid");
    const cards = Array.from(grid?.children ?? []);
    expect(cards).toHaveLength(5);
    expect(cards[0].classList.contains("ov-kpi--gross")).toBe(true);
    expect(cards[0].textContent).toContain("Ventes totales");
    expect(cards[0].textContent).toContain("100 USD");
    expect(cards[1].classList.contains("ov-kpi--profit")).toBe(true);
    expect(cards[1].textContent).toContain("Bénéfices nets");
    expect(grid?.querySelector(".ov-kpi--revenue")).toBeNull();
    expect(grid?.textContent).not.toContain("Net revenue");
    const css = readFileSync(new URL("../app/dashboard-overview.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.ov-kpi-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(document.querySelector('[data-testid="campaigns"]')).not.toBeNull();
    expect(document.querySelector(".ov-sales")?.textContent).toContain("Produit de test");
    expect(document.querySelector(".ov-catalogue")?.textContent).toContain("Produit de test");
    // The real ad-spend component renders its section heading; it is not replaced by a stub.
    expect(html).toMatch(/Dépenses|dépenses|advertising spend/i);
  });
});
