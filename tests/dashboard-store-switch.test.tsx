// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => createElement("a", props, children) }));
vi.mock("next/image", () => ({ default: (props: any) => createElement("img", props) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { user_metadata: { name: "Test" } } } }), signOut: async () => ({}) } }) }));
vi.mock("@/components/useUsageTracking", () => ({ useUsageTracking: () => {} }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
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
vi.mock("@/components/dashboard/OverviewHome", () => ({
  OverviewHome: ({ analytics }: any) => createElement("output", { "data-testid": "snapshot" }, analytics?.marker ?? analytics?.products?.map((p: any) => p.name).join(",") ?? "vide"),
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

    const select = host.querySelector("select")!;
    await act(async () => {
      select.value = "b";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(host.querySelector('[data-testid="dashboard-skeleton"]')).not.toBeNull();
    expect(host.textContent).not.toContain("snapshot-A");
    expect(await eventually(() => requests.some((r) => r.id === "b"))).toBe(true);

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
