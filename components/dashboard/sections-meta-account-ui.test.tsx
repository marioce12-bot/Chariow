import { act, createElement } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { JSDOM } = require("jsdom") as { JSDOM: new (html: string, options: { url: string }) => any };

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
vi.mock("@/components/TikTokAdsPanel", () => ({ TikTokAdsPanel: () => null }));
vi.mock("@/components/PinterestAdsPanel", () => ({ PinterestAdsPanel: () => null }));
vi.mock("@/components/dashboard/MetaHistoryOverview", () => ({ MetaHistoryOverview: () => null }));
vi.mock("@/components/dashboard/OverviewDetails", () => ({ OverviewDetails: () => null }));
vi.mock("@/components/vendeo/AdCampaignsList", () => ({ AdCampaignsList: () => null }));

const recentSync = new Date().toISOString();
const accounts = ["A", "B", "C"].map((id) => ({ id, name: `Compte ${id}`, currency: "USD", last_synced_at: recentSync }));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const jsonResponse = (data: unknown, ok = true) => ({ ok, json: async () => data });
const performance = (id: string) => ({
  currency: "USD",
  chariowRevenueByCurrency: [],
  lastSyncedAt: recentSync,
  lastSyncError: null,
  overview: { spend: id === "A" ? 111 : id === "B" ? 222 : 333, chariowRevenue: null, metaReportedRevenue: 0, attributedGrossRevenue: null, attributedNetRevenue: null, attributedRevenue: null, attributedSpend: null, attributedCustomers: 0, attributedCostPerCustomer: null, conversions: 0, sales: 0, cpa: null, cac: null, metaRoas: null, realRoas: null, attributionCoverage: 0, state: "C", vendeoCampaigns: 0, verifiedSales: 0 },
  performances: [],
});
const resources = (id: string) => ({ pages: [], pixels: [{ id: `pixel-${id}`, name: `Pixel ${id}` }] });

let dom: any;
let container: HTMLElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let resolvePerformance: (account: string, response: any) => void;
let pending: Map<string, ReturnType<typeof deferred<any>>>;

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function chooseAccount(id: string) {
  const select = container.querySelector(".meta-toolbar select") as HTMLSelectElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, id);
    select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  });
}
async function openMetaTab() {
  const tab = [...container.querySelectorAll("button")].find((button) => /meta/i.test(button.textContent ?? ""));
  if (tab) await act(async () => { tab.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
  await settle();
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, sessionStorage: dom.window.sessionStorage, localStorage: dom.window.localStorage });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  container = dom.window.document.getElementById("root")!;
  root = createRoot(container);
  pending = new Map();
  resolvePerformance = (account, response) => pending.get(account)!.resolve(response);
  fetchMock = vi.fn((url: string) => {
    if (url === "/api/integrations/meta/accounts") return Promise.resolve(jsonResponse({ accounts }));
    if (url === "/api/integrations/tiktok/accounts" || url === "/api/integrations/pinterest/accounts") return Promise.resolve(jsonResponse({ accounts: [] }));
    if (url.startsWith("/api/meta/performance?account_id=")) {
      const account = new URL(url, "http://localhost").searchParams.get("account_id")!;
      if (!pending.has(account)) pending.set(account, deferred());
      return pending.get(account)!.promise;
    }
    if (url.startsWith("/api/integrations/meta/resources?account_id=")) {
      const account = new URL(url, "http://localhost").searchParams.get("account_id")!;
      return Promise.resolve(jsonResponse(resources(account)));
    }
    return Promise.resolve(jsonResponse({}));
  });
  vi.stubGlobal("fetch", fetchMock);
  const { AdsView } = await import("./sections");
  await act(async () => {
    root.render(createElement(AdsView, { plan: "starter", onGoToAI: vi.fn(), onGoToAccounts: vi.fn(), onLaunchAd: vi.fn(), storeId: null, campaignsVersion: 0 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); dom.window.close(); });

describe("AdsView Meta account switching in the DOM", () => {
  it("keeps the connected toolbar and launch action visible while only account data is skeletonized", async () => {
    resolvePerformance("A", jsonResponse(performance("A")));
    await settle();
    await openMetaTab();
    expect(container.textContent).toContain("Pixel A");
    await chooseAccount("B");
    expect(container.querySelector('[role="status"][aria-label="Chargement des données du compte Meta"]')).not.toBeNull();
    expect(container.querySelector(".meta-toolbar select")?.textContent).toContain("Compte B");
    expect(container.querySelector(".meta-toolbar")).not.toBeNull();
    expect(container.textContent).toContain("ads.connected");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.includes("ads.launch"))).toBe(true);
    expect(container.textContent).not.toContain("Pixel A");
    expect(container.textContent).not.toContain("111");
  });

  it("ignores late A/B responses after C is selected and publishes only C resources", async () => {
    resolvePerformance("A", jsonResponse(performance("A")));
    await settle();
    await openMetaTab();
    await chooseAccount("B");
    await chooseAccount("C");
    resolvePerformance("C", jsonResponse(performance("C")));
    await settle();
    expect(container.textContent).toContain("Pixel C");
    resolvePerformance("B", jsonResponse(performance("B")));
    await settle();
    expect(container.textContent).toContain("Pixel C");
    expect(container.textContent).not.toContain("Pixel A");
    expect(container.textContent).not.toContain("Pixel B");
    expect(container.querySelector(".meta-toolbar select")?.textContent).toContain("Compte C");
  });

  it("shows an explicit error and no old account data when the selected account fetch fails", async () => {
    resolvePerformance("A", jsonResponse(performance("A")));
    await settle();
    await openMetaTab();
    await chooseAccount("B");
    resolvePerformance("B", jsonResponse({ error: "failed" }, false));
    await settle();
    expect(container.querySelector('[role="status"][aria-label="Chargement des données du compte Meta"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Impossible de charger les données de ce compte Meta.");
    expect(container.textContent).not.toContain("Pixel A");
    expect(container.textContent).not.toContain("111");
  });
});
