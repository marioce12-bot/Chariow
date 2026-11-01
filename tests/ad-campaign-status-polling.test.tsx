// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdCampaignsList } from "@/components/vendeo/AdCampaignsList";
import { NavigationDataProvider } from "@/components/dashboard/NavigationDataCache";
const { JSDOM } = require("jsdom") as { JSDOM: new (html: string, options: { url: string }) => any };
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => ({ "campaigns.title": "Campagnes", "campaigns.empty": "Aucune campagne", "campaigns.loading": "Chargement", "campaigns.refresh": "Actualiser", "campaigns.launch": "Lancer", "campaigns.duplicate": "Dupliquer", "adsExtra.status.active": "Active", "adsExtra.status.paused": "Suspendue", "adsExtra.duplicate": "Dupliquer" }[key] ?? key) }) }));
vi.mock("@/components/vendeo/wizard/ResumeCampaignModal", () => ({ ResumeCampaignModal: () => null }));
vi.mock("@/components/vendeo/wizard/LaunchAdWizard", () => ({ LaunchAdWizard: () => null }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let dom: any; let root: Root; let container: HTMLElement; let fetchMock: ReturnType<typeof vi.fn>;
let visible = "visible"; let focused = true;
const campaign = { id: "poll-linked", product_id: "p1", platform: "meta", status: "active", objective: "sales", title: "Campagne test", daily_budget: 10, duration_days: 3, estimated_budget: 30, external_error: null, created_at: "2026-01-01", external_campaign_id: "meta-linked" };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, navigator: dom.window.navigator });
  visible = "visible"; focused = true;
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visible });
  Object.defineProperty(document, "hasFocus", { configurable: true, value: () => focused });
  container = document.getElementById("root")!; root = createRoot(container);
  fetchMock = vi.fn(async (url: string) => url === "/api/subscription" ? ({ ok: true, json: async () => ({ subscription: { plan: "starter" } }) }) : url.startsWith("/api/ad-campaigns") && !url.endsWith("/status") ? ({ ok: true, json: async () => ({ campaigns: [campaign] }) }) : ({ ok: true, json: async () => ({}) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { act(() => root.unmount()); vi.unstubAllGlobals(); dom.window.close(); vi.useRealTimers(); });
const statusCount = () => fetchMock.mock.calls.filter(([url]) => String(url) === "/api/ad-campaigns/poll-linked/status").length;
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
describe("Ad campaign status refresh", () => {
  it("skips hidden/unfocused polling, de-duplicates foreground return, and allows manual refresh immediately", async () => {
    await act(async () => { root.render(<NavigationDataProvider><AdCampaignsList storeId="poll-test-store" onNewCampaign={vi.fn()} /></NavigationDataProvider>); await Promise.resolve(); await Promise.resolve(); });
    await flush();
    expect(statusCount()).toBe(1);
    visible = "hidden"; focused = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(statusCount()).toBe(1);
    visible = "visible";
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
    expect(statusCount()).toBe(1);
    focused = true;
    await act(async () => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
    expect(statusCount()).toBe(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(statusCount()).toBe(3);
    await act(async () => { container.querySelector<HTMLButtonElement>('button[aria-label="Actualiser"]')!.click(); await Promise.resolve(); });
    expect(statusCount()).toBe(4);
  });
});
