// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n/translate";
import { NavigationDataProvider, useNavigationCache } from "@/components/dashboard/NavigationDataCache";
import { AdSpendByChannel } from "@/components/dashboard/AdSpendByChannel";
import { AdsView } from "@/components/dashboard/sections";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string, vars?: Record<string, string | number>) => translate("fr", key, vars) }) }));
vi.mock("@/components/TikTokAdsPanel", () => ({ TikTokAdsPanel: () => null }));
vi.mock("@/components/PinterestAdsPanel", () => ({ PinterestAdsPanel: () => null }));
vi.mock("@/components/dashboard/MetaHistoryOverview", () => ({ MetaHistoryOverview: () => null }));
vi.mock("@/components/dashboard/OverviewDetails", () => ({ OverviewDetails: () => null }));
vi.mock("@/components/vendeo/AdCampaignsList", () => ({ AdCampaignsList: () => null }));

const recentSync = new Date().toISOString();
const perf = (amount: number) => ({
  currency: "USD", chariowRevenueByCurrency: [], lastSyncedAt: recentSync, lastSyncError: null,
  overview: { spend: amount, chariowRevenue: null, metaReportedRevenue: 0, attributedGrossRevenue: null, attributedNetRevenue: null, attributedRevenue: null, attributedSpend: null, attributedCustomers: 0, attributedCostPerCustomer: null, conversions: 0, sales: 0, cpa: null, cac: null, metaRoas: null, realRoas: null, attributionCoverage: 0, state: "C", vendeoCampaigns: 0, verifiedSales: 0, clicks: 7 },
  performances: [{ id: "campaign-A", name: `Campaign ${amount}`, clicks: 7, impressions: 70, spend: amount, conversions: 1 }],
});
const json = (data: unknown, ok = true) => ({ ok, json: async () => data });
let root: Root;
let host: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
let store: string | null;
let revision: number;

function Workspace({ initialStore = "store-a", spendOnly = false }: { initialStore?: string; spendOnly?: boolean }) {
  const [visible, setVisible] = useState(true);
  const [activeStore, setActiveStore] = useState<string | null>(initialStore);
  const cache = useNavigationCache();
  return <><button onClick={() => setVisible((v) => !v)}>Toggle Ads</button><button onClick={() => { store = "store-b"; setActiveStore("store-b"); }}>Change store</button><button onClick={() => { revision++; cache.invalidate(); }}>Mutation success</button>{visible && spendOnly ? <AdSpendByChannel key={activeStore} plan="starter" storeId={activeStore} periodDays={30} refreshKey={0} /> : visible ? <AdsView key={activeStore ?? "none"} plan="starter" onGoToAI={() => {}} onGoToAccounts={() => {}} onLaunchAd={() => {}} storeId={activeStore} campaignsVersion={0} /> : null}</>;
}

async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
async function click(label: string) { await act(async () => { [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label))?.click(); }); await settle(); }
async function mount() { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(<NavigationDataProvider><Workspace /></NavigationDataProvider>)); await settle(); }

beforeEach(async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  store = "store-a"; revision = 1;
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST" && url === "/api/meta/sync") throw new Error("unexpected sync for recent account");
    if (url === "/api/integrations/meta/accounts") return json({ accounts: store === "store-a" ? [{ id: "account-A", name: "Compte A", currency: "USD", is_selected: true, last_synced_at: recentSync }] : [] });
    if (url === "/api/integrations/tiktok/accounts" || url === "/api/integrations/pinterest/accounts") return json({ accounts: [] });
    if (url.startsWith("/api/meta/performance?account_id=")) return json(perf(revision === 1 ? 111 : 222));
    if (url.startsWith("/api/integrations/meta/resources?account_id=")) return json({ pages: [{ id: "page-A", name: `Page ${revision}` }], pixels: [{ id: "pixel-A", name: `Pixel ${revision}` }] });
    if (url === "/api/integrations/meta/accounts" || url.includes("/api/integrations/")) return json({ accounts: [] });
    if (url === "/api/ad-campaigns") return json({ campaigns: [] });
    if (url.startsWith("/api/tiktok/") || url.startsWith("/api/pinterest/")) return json({ currency: "USD", overview: { spend: 0, clicks: 0, conversions: 0 } });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  await mount();
});
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); vi.unstubAllGlobals(); });

const countRequests = (fragment: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment)).length;

describe("AdsView navigation cache integration", () => {
  it("restores account performance/resources immediately after remount without repeat GETs; store scope is isolated", async () => {
    await click("Meta");
    expect(host.textContent).toContain("Pixel 1");
    expect(host.textContent).toContain("111");
    const before = { accounts: countRequests("/api/integrations/meta/accounts"), performance: countRequests("/api/meta/performance?account_id=account-A"), resources: countRequests("/api/integrations/meta/resources?account_id=account-A") };
    await click("Toggle Ads"); await click("Toggle Ads");
    await click("Meta");
    expect(host.textContent).toContain("Pixel 1");
    expect(host.textContent).toContain("111");
    expect(host.querySelector('[aria-busy="true"]')).toBeNull();
    expect(countRequests("/api/integrations/meta/accounts")).toBe(before.accounts);
    expect(countRequests("/api/meta/performance?account_id=account-A")).toBe(before.performance);
    expect(countRequests("/api/integrations/meta/resources?account_id=account-A")).toBe(before.resources);
    await click("Change store");
    expect(host.textContent).not.toContain("Pixel 1");
    expect(host.textContent).not.toContain("111");
    await settle();
    expect(countRequests("/api/integrations/meta/accounts")).toBe(before.accounts + 1);
    expect(host.textContent).not.toContain("Pixel 1");
  });

  it("retries a first reading abandoned while navigating away instead of caching empty data", async () => {
    const original = fetchMock.getMockImplementation()!;
    let resolveAccounts!: (value: unknown) => void;
    let delay = true;
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/integrations/meta/accounts" && delay) {
        delay = false;
        return new Promise((resolve) => { resolveAccounts = resolve; });
      }
      return original(input, init);
    });
    await act(async () => root.render(<NavigationDataProvider key="rapid-navigation"><Workspace /></NavigationDataProvider>));
    await click("Toggle Ads");
    await act(async () => { resolveAccounts(json({ accounts: [{ id: "account-A", name: "Compte A", currency: "USD", last_synced_at: recentSync }] })); });
    await click("Toggle Ads");
    await click("Meta");
    expect(host.textContent).toContain("Pixel 1");
    expect(host.querySelector('[aria-busy="true"]')).toBeNull();
  });
  it("invalidate after a successful update refreshes the visible Meta data", async () => {
    await click("Meta");
    expect(host.textContent).toContain("Pixel 1");
    revision = 2;
    await click("Mutation success");
    await settle();
    expect(host.textContent).toContain("222");
    expect(countRequests("/api/meta/performance?account_id=account-A")).toBeGreaterThan(1);
    expect(countRequests("/api/integrations/meta/resources?account_id=account-A")).toBeGreaterThan(1);
  });
});

describe("real AdSpendByChannel cache integration", () => {
  it("retains its aggregate across AdsView remount and separates a new store scope", async () => {
    await act(async () => { root.render(<NavigationDataProvider key="spend"><Workspace spendOnly /></NavigationDataProvider>); });
    await settle();
    expect(host.textContent).toContain("111,00 USD");
    const performanceReads = countRequests("/api/meta/performance?account_id=account-A");
    const spendReadCount = fetchMock.mock.calls.length;
    await click("Toggle Ads"); await click("Toggle Ads");
    expect(host.textContent).toContain("111,00 USD");
    expect(host.querySelector('[aria-busy="true"]')).toBeNull();
    expect(countRequests("/api/meta/performance?account_id=account-A")).toBe(performanceReads);
    await click("Change store"); await settle();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(spendReadCount);
    expect(host.textContent).not.toContain("111,00 USD");
  });
});
