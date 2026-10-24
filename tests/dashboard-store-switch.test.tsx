// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => createElement("a", props, children) }));
vi.mock("next/image", () => ({ default: (props: any) => createElement("img", props) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { user_metadata: { name: "Test" } } } }), signOut: async () => ({}) } }) }));
vi.mock("@/components/useUsageTracking", () => ({ useUsageTracking: () => {} }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
vi.mock("@/components/ChatView", () => ({ ChatView: () => null }));
vi.mock("@/components/NotificationCenter", () => ({ NotificationCenter: () => null }));
vi.mock("@/components/vendeo/AutopilotView", () => ({ AutopilotView: () => null }));
vi.mock("@/components/NotificationsView", () => ({ NotificationsView: () => null }));
vi.mock("@/components/vendeo", () => ({ ImpactFinancierCard: () => null, LaunchAdBar: () => null, CampaignCrossTable: () => null, DiagnosticBoutique: () => null }));
vi.mock("@/components/vendeo/wizard", () => ({ LaunchAdWizard: () => null }));
vi.mock("@/components/dashboard/PerformanceVisuelView", () => ({ PerformanceVisuelView: () => null }));
vi.mock("@/components/dashboard/DesktopNavigation", () => ({
  DashboardHeaderNavigation: () => null,
  DashboardPrimaryNavigation: ({ onChange }: any) => createElement("nav", null, ...["Vue d'ensemble", "Vendeo AI", "Studio", "Pub", "Comptes publicitaires", "Radar marché", "Mes boutiques", "Rapports", "Bénéfices nets", "Relances WhatsApp", "Performance publicitaire", "Abonnement", "Paramètres", "Notifications", "Suggestions et notes"].map(section => createElement("button", { key: section, onClick: () => onChange(section) }, section))),
}));
vi.mock("@/components/dashboard/sections", () => ({
  StoreOnboarding: () => null, StudioView: () => null, MarketRadarView: () => null,
  AdsView: () => null, MobileSettingsView: () => null, StoresView: () => null,
  SubscriptionView: () => null, Reports: () => null,
}));
vi.mock("@/components/dashboard/OverviewHome", () => ({
  OverviewHome: ({ analytics, storeSelector }: any) => createElement("div", null, createElement("output", { "data-testid": "snapshot" }, analytics?.marker ?? analytics?.products?.map((p: any) => p.name).join(",") ?? "vide"), createElement("div", { "data-testid": "overview-store-slot" }, storeSelector)),
}));
vi.mock("@/components/dashboard/Skeleton", () => ({ DashboardSkeleton: () => createElement("div", { "data-testid": "dashboard-skeleton" }, "Chargement") }));
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

describe("Dashboard store switch", () => {
  it("keeps the sidebar selector functional on every section and mobile selection only on overview", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/stores") return jsonResponse({ stores: [{ id: "a", store_name: "Boutique A" }, { id: "b", store_name: "Boutique B" }] });
      if (url === "/api/subscription") return jsonResponse({ subscription: { status: "active", trial_active: false } });
      return jsonResponse({ snapshot: { marker: "loaded" } });
    }));
    await mount();
    await eventually(() => !host.querySelector('[data-testid="dashboard-skeleton"]'));
    const links = Array.from(host.querySelectorAll<HTMLButtonElement>(".sidebar nav button"));
    expect(links.length).toBe(15);
    for (const link of links) {
      await act(async () => { link.click(); });
      const selector = host.querySelector<HTMLSelectElement>(".sidebar #desktop-dashboard-store")!;
      expect(selector, link.textContent!).not.toBeNull();
      expect(selector.disabled).toBe(false);
      const next = selector.value === "a" ? "b" : "a";
      await act(async () => { selector.value = next; selector.dispatchEvent(new Event("change", { bubbles: true })); });
      expect(localStorage.getItem("vendeo_selected_store_id")).toBe(next);
      expect(selector.value).toBe(next);
      const overview = link.textContent === "Vue d'ensemble";
      expect(Boolean(host.querySelector("#mobile-dashboard-store"))).toBe(overview);
      expect(host.textContent).not.toContain("Suivi à vérifier");
    }
  });
  it("shows loading on switch and never renders an abandoned store snapshot (including empty/failure responses)", async () => {
    const first = deferred();
    const second = deferred();
    const requests: Array<{ id: string; deferred: ReturnType<typeof deferred> }> = [];
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/stores") return Promise.resolve(jsonResponse({ stores: [
        { id: "a", store_name: "Boutique A" }, { id: "b", store_name: "Boutique B" }, { id: "c", store_name: "Boutique C" },
      ] }));
      if (url === "/api/subscription") return Promise.resolve(jsonResponse({ subscription: { status: "active", trial_active: false } }));
      const id = new URL(url, "http://localhost").searchParams.get("store_id")!;
      const d = id === "a" ? first : second;
      requests.push({ id, deferred: d });
      // Deliberately ignore AbortSignal to model a late response from an abandoned request.
      return d.promise;
    }));

    await mount();
    expect(await eventually(() => requests.some((r) => r.id === "a"))).toBe(true);
    await act(async () => { first.resolve(jsonResponse({ snapshot: { marker: "snapshot-A" } })); });
    expect(host.textContent).toContain("snapshot-A");

    const homePicker = host.querySelector('[data-testid="desktop-store-selector"]')!;
    expect(homePicker).not.toBeNull();
    expect(homePicker.closest(".sidebar")).not.toBeNull();
    expect(host.querySelector(".app-header select")).toBeNull();
    expect(host.querySelector(".sidebar .side-label")).toBeNull();
    expect(homePicker.querySelector("label > span")).toBeNull();
    expect(homePicker.querySelector("select")?.getAttribute("aria-label")).toBe("interfaceExtra.displayedStore");
    expect(host.querySelector("#mobile-dashboard-store")).not.toBeNull();
    const select = homePicker.querySelector("select")!;
    expect(select.options.length).toBe(3);
    await act(async () => {
      select.value = "b";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.querySelector('[data-testid="dashboard-skeleton"]')).not.toBeNull();
    expect(host.textContent).not.toContain("snapshot-A");
    expect(await eventually(() => requests.some((r) => r.id === "b"))).toBe(true);
    expect(localStorage.getItem("vendeo_selected_store_id")).toBe("b");
    expect(localStorage.getItem("vendeo_selected_store_id")).toBe("b");

    // Old request settles after B was selected; the identity guard must hide A even before B completes.
    await act(async () => { first.resolve(jsonResponse({ snapshot: { marker: "snapshot-A-late" } })); });
    expect(host.textContent).not.toContain("snapshot-A-late");
    expect(host.querySelector('[data-testid="dashboard-skeleton"]')).not.toBeNull();

    // A successful empty snapshot ends loading without restoring A.
    await act(async () => { second.resolve(jsonResponse({ snapshot: null })); });
    expect(await eventually(() => host.querySelector('[data-testid="dashboard-skeleton"]') === null)).toBe(true);
    expect(host.textContent).not.toContain("snapshot-A");
    expect(host.querySelector('[data-testid="snapshot"]')?.textContent).toBe("vide");
  });
});

async function eventually(predicate: () => boolean, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    if (predicate()) return true;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  return predicate();
}
