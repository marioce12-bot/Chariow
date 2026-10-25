// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => createElement("a", props, children) }));
vi.mock("next/image", () => ({ default: (props: any) => createElement("img", props) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
const authentication = vi.hoisted(() => ({ listener: null as null | ((event: string, session: any) => void) }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({ auth: {
  getUser: async () => ({ data: { user: { user_metadata: { name: "Test" } } } }), signOut: async () => ({}),
  onAuthStateChange: (listener: any) => { authentication.listener = listener; listener("INITIAL_SESSION", { user: { id: "user-a" } }); return { data: { subscription: { unsubscribe() {} } } }; },
} }) }));
vi.mock("@/components/useUsageTracking", () => ({ useUsageTracking: () => {}, clearUsageSessionStorage: vi.fn() }));
const language = vi.hoisted(() => ({ locale: "fr" }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: language.locale, t: (key: string) => key }) }));
vi.mock("@/components/ChatView", () => ({ ChatView: () => null }));
vi.mock("@/components/NotificationCenter", () => ({ NotificationCenter: () => null }));
vi.mock("@/components/vendeo/AutopilotView", () => ({ AutopilotView: () => null }));
vi.mock("@/components/NotificationsView", () => ({ NotificationsView: () => null }));
vi.mock("@/components/vendeo", () => ({ ImpactFinancierCard: () => null, LaunchAdBar: () => null, CampaignCrossTable: () => null, DiagnosticBoutique: () => null }));
vi.mock("@/components/vendeo/wizard", () => ({ LaunchAdWizard: () => null }));
vi.mock("@/components/dashboard/DesktopNavigation", () => ({
  DashboardHeaderNavigation: () => null,
  DashboardPrimaryNavigation: () => null,
}));
vi.mock("@/components/dashboard/sections", () => ({
  StoreOnboarding: () => null, StudioView: () => null, MarketRadarView: () => null,
  AdsView: () => null, MobileSettingsView: () => null, StoresView: () => null,
  SubscriptionView: () => null, Reports: () => null,
}));
vi.mock("@/components/dashboard/AdSpendByChannel", () => ({ AdSpendByChannel: () => null }));
vi.mock("@/components/vendeo/AdCampaignsList", () => ({ AdCampaignsList: () => null }));

vi.mock("@/components/dashboard/ProductProfitPanel", () => ({ default: () => null }));
vi.mock("@/components/dashboard/RecoveryPanel", () => ({ default: () => null }));

import { Dashboard } from "@/components/Dashboard";

let host: HTMLDivElement;
let root: Root;
const deferred = () => {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>((r) => { resolve = r; });
  return { promise, resolve };
};
const jsonResponse = (payload: any) => ({ ok: true, json: async () => payload });

async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root.render(createElement(Dashboard)); });
}

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});


describe("Dashboard navigation cache", () => {
  it.each(["fr", "en"])("returns home without refetching analytics, catalogue, campaigns and alerts; no home refresh button is shown (%s)", async (locale) => {
    language.locale = locale;
    let revision = 1;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/stores") return jsonResponse({ stores: [{ id: "a", store_name: "Boutique A", platform: "chariow", connection_status: "connected" }] });
      if (url === "/api/subscription") return jsonResponse({ subscription: { status: "active", trial_active: false, plan: "starter" } });
      if (url === "/api/ad-campaigns") return jsonResponse({ campaigns: [] });
      if (url === "/api/alerts") return jsonResponse({ alerts: [{ id: "notice", title: `Alerte ${revision}`, description: "Test" }] });
      return jsonResponse({ snapshot: { kpis: { sales: revision }, overview: { currency: "USD", revenue: revision * 100, sales: revision }, products: [{ id: "book", name: `Catalogue ${revision}`, price: 10, currency: "USD" }], sales: [] } });
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    expect(await eventually(() => host.textContent?.includes("Catalogue 1") ?? false)).toBe(true);
    const requests = fetcher.mock.calls.length;
    const nav = host.querySelector(".mobile-nav")!;
    const buttons = nav.querySelectorAll("button");
    await act(async () => { buttons[1].click(); });
    expect(host.textContent).not.toContain("Catalogue 1");
    await act(async () => { buttons[0].click(); });
    expect(host.textContent).toContain("Catalogue 1");
    expect(host.textContent).toContain("Alerte 1");
    expect(host.querySelector('[data-testid="dashboard-skeleton"]')).toBeNull();
    expect(fetcher.mock.calls.length).toBe(requests);
    expect(host.querySelector(".dashboard-home")?.textContent).not.toMatch(/Actualiser|Refresh/);
  });
  it("discards the workspace cache when authentication switches to another user", async () => {
    let user = "A";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/stores") return jsonResponse({ stores: [{ id: "same-store-id", store_name: "Shop", platform: "chariow", connection_status: "connected" }] });
      if (url === "/api/subscription") return jsonResponse({ subscription: { status: "active", trial_active: false, plan: "starter" } });
      if (url === "/api/ad-campaigns") return jsonResponse({ campaigns: [] });
      if (url === "/api/alerts") return jsonResponse({ alerts: [] });
      return jsonResponse({ snapshot: { kpis: { sales: 1 }, products: [{ id: "book", name: `Private catalogue ${user}`, price: 10 }], sales: [] } });
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    expect(await eventually(() => host.textContent?.includes("Private catalogue A") ?? false)).toBe(true);
    user = "B";
    await act(async () => { authentication.listener!("SIGNED_IN", { user: { id: "user-b" } }); });
    expect(host.textContent).not.toContain("Private catalogue A");
    expect(await eventually(() => host.textContent?.includes("Private catalogue B") ?? false)).toBe(true);
    expect(fetcher.mock.calls.filter(([url]) => String(url) === "/api/stores")).toHaveLength(2);
  });

});
async function eventually(predicate: () => boolean, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    if (predicate()) return true;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  return predicate();
}
