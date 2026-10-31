// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

const auth = vi.hoisted(() => ({ signOut: vi.fn() }));
const push = vi.hoisted(() => ({ disable: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({ auth: {
  getUser: async () => ({ data: { user: { id: "user-a", user_metadata: { name: "Test" } } } }),
  signOut: auth.signOut,
} }) }));
vi.mock("@/lib/push/browser", () => ({ disablePushSubscription: push.disable }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: any) => createElement("a", props, children) }));
vi.mock("next/image", () => ({ default: ({ unoptimized, priority, ...props }: any) => createElement("img", props) }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
vi.mock("@/components/useUsageTracking", () => ({ useUsageTracking: () => {} }));
vi.mock("@/components/ChatView", () => ({ ChatView: () => null }));
vi.mock("@/components/NotificationCenter", () => ({ NotificationCenter: () => null }));
vi.mock("@/components/NotificationPermissionPrompt", () => ({ NotificationPermissionPrompt: () => null }));
vi.mock("@/components/vendeo/AutopilotView", () => ({ AutopilotView: () => null }));
vi.mock("@/components/NotificationsView", () => ({ NotificationsView: () => null }));
vi.mock("@/components/vendeo", () => ({ ImpactFinancierCard: () => null, LaunchAdBar: () => null, CampaignCrossTable: () => null, DiagnosticBoutique: () => null }));
vi.mock("@/components/vendeo/wizard", () => ({ LaunchAdWizard: () => null }));
vi.mock("@/components/dashboard/DesktopNavigation", () => ({ DashboardHeaderNavigation: () => null, DashboardPrimaryNavigation: () => null }));
vi.mock("@/components/dashboard/sections", () => ({
  StudioView: () => null, MarketRadarView: () => null, AdsView: () => null,
  MobileSettingsView: ({ onSignOut }: { onSignOut: () => void }) => createElement("button", { "data-testid": "mobile-settings-signout", onClick: onSignOut }, "Sign out"),
  StoresView: () => null, SubscriptionView: () => null, Reports: () => null,
}));
vi.mock("@/components/dashboard/OverviewHome", () => ({ OverviewHome: () => null }));
vi.mock("@/components/dashboard/ProductProfitPanel", () => ({ default: () => null }));
vi.mock("@/components/dashboard/RecoveryPanel", () => ({ default: () => null }));
vi.mock("@/components/dashboard/SaleCelebration", () => ({ SaleCelebration: () => null }));

import { Dashboard } from "@/components/Dashboard";

let root: Root | undefined;
let host: HTMLDivElement;
let sessions: Set<string>;
let location: { href: string };
const cacheDelete = vi.fn();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessions = new Set(["desktop", "phone"]);
  // Model Supabase's documented default: no scope revokes every session.
  auth.signOut.mockImplementation(async (options?: { scope?: string }) => {
    if (options?.scope === "local") sessions.delete("desktop");
    else sessions.clear();
    return { error: null };
  });
  push.disable.mockResolvedValue(undefined);
  cacheDelete.mockResolvedValue(true);
  location = { href: window.location.href };
  const browser = window;
  vi.stubGlobal("window", new Proxy(browser, {
    get(target, property) {
      if (property === "location") return location;
      if (property === "scrollTo") return () => {};
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }));
  vi.stubGlobal("caches", { open: vi.fn(async () => ({ delete: cacheDelete })) });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => ({
    ok: true,
    json: async () => String(input) === "/api/stores"
      ? { stores: [{ id: "store", store_name: "Shop", platform: "chariow", connection_status: "connected" }] }
      : String(input) === "/api/subscription"
        ? { subscription: { status: "active", plan: "starter" } }
        : { alerts: [], campaigns: [], snapshot: { products: [], sales: [], kpis: {} } },
  })));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host.remove();
  window.sessionStorage.clear();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function click(selector: string) {
  const button = host.querySelector<HTMLButtonElement>(selector);
  expect(button, selector).not.toBeNull();
  await act(async () => button!.click());
}
function expectOnlyThisDeviceSignedOut() {
  expect(auth.signOut).toHaveBeenCalledOnce();
  expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(sessions.has("desktop")).toBe(false);
  expect(sessions.has("phone")).toBe(true);
  expect(location.href).toBe("/");
}

describe("device-local user sign-out", () => {
  it("desktop logout preserves the phone session and cleans only the local shell/push", async () => {
    await act(async () => root!.render(createElement(Dashboard)));
    await click(".desktop-signout");
    expectOnlyThisDeviceSignedOut();
    expect(cacheDelete).toHaveBeenCalledWith("/dashboard");
    expect(push.disable).toHaveBeenCalledOnce();
    expect(push.disable.mock.invocationCallOrder[0]).toBeLessThan(auth.signOut.mock.invocationCallOrder[0]);
  });
  it("mobile settings use the same device-local sign-out", async () => {
    window.sessionStorage.setItem("vendeo_dashboard_active_section", "Paramètres");
    await act(async () => root!.render(createElement(Dashboard)));
    await click('[data-testid="mobile-settings-signout"]');
    expectOnlyThisDeviceSignedOut();
  });
  it("the mobile more-menu settings route preserves the other device session on sign-out", async () => {
    await act(async () => root!.render(createElement(Dashboard)));
    await click(".mobile-more-trigger");
    await click('.mobile-more-menu button[role="menuitem"]:last-of-type');
    await click('[data-testid="mobile-settings-signout"]');
    expectOnlyThisDeviceSignedOut();
  });
  it("push cleanup failure never falls back to a global logout", async () => {
    push.disable.mockRejectedValueOnce(new Error("offline"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    await act(async () => root!.render(createElement(Dashboard)));
    await click(".desktop-signout");
    expectOnlyThisDeviceSignedOut();
    warning.mockRestore();
  });
});
