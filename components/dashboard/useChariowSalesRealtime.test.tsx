import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { JSDOM } = require("jsdom") as { JSDOM: new (html: string, options: Record<string, unknown>) => any };
const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/browser", () => ({ createClient: mocks.createClient }));
import { NavigationDataProvider, useNavigationCache, useNavigationData } from "./NavigationDataCache";
import { useChariowSalesRealtime } from "./useChariowSalesRealtime";
import { DASHBOARD_ANALYTICS_FALLBACK_MS } from "@/lib/dashboard-analytics-periods";

type Payload = { new: Record<string, unknown> };
type FakeChannel = { name: string; filter?: Record<string, unknown>; deliver?: (payload: Payload) => void; on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
let dom: any; let root: Root; let container: HTMLElement;
let focused: boolean; let visibility: DocumentVisibilityState;
let fetchMock: ReturnType<typeof vi.fn>; let removeChannel: ReturnType<typeof vi.fn>; let channels: FakeChannel[];
function Probe({ storeId }: { storeId: string }) {
  const cache = useNavigationCache();
  const reading = useNavigationData<{ version: number }>(`/api/analytics?store_id=${storeId}&dashboard_periods=1`);
  useChariowSalesRealtime(storeId, "user-1", cache);
  return createElement("button", { onClick: reading.refresh }, String(reading.data?.version ?? "loading"));
}
async function render(storeId = "store-1") {
  await act(async () => { root.render(createElement(NavigationDataProvider, { children: createElement(Probe, { storeId }) })); });
}
async function emit(channel: FakeChannel, id: string, storeId = "store-1", userId = "user-1") {
  await act(async () => { channel.deliver?.({ new: { event_id: id, store_id: storeId, user_id: userId, status: "paid", amount: 42, currency: "XOF", product_id: "p1", product_name: "Livre", created_at: "2026-11-01T08:00:00.000Z" } }); });
}
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-01T08:00:00.000Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://local.invalid", pretendToBeVisual: true });
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document); vi.stubGlobal("HTMLElement", dom.window.HTMLElement); vi.stubGlobal("navigator", dom.window.navigator);
  focused = true; visibility = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
  Object.defineProperty(document, "hasFocus", { configurable: true, value: () => focused });
  container = document.getElementById("root")!; root = createRoot(container);
  let version = 0; fetchMock = vi.fn(async () => Response.json({ version: ++version })); vi.stubGlobal("fetch", fetchMock);
  channels = []; removeChannel = vi.fn(async () => "ok");
  mocks.createClient.mockReturnValue({
    channel: vi.fn((name: string) => {
      const channel: FakeChannel = { name, on: vi.fn(), subscribe: vi.fn() };
      channel.on.mockImplementation((_type: string, filter: Record<string, unknown>, callback: (payload: Payload) => void) => { channel.filter = filter; channel.deliver = callback; return channel; });
      channel.subscribe.mockReturnValue(channel); channels.push(channel); return channel;
    }), removeChannel,
  });
  await render();
});
afterEach(async () => { await act(async () => root.unmount()); dom.window.close(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Sales Realtime analytics flow", () => {
  it("does not poll analytics while nothing happens, even after the fallback deadline", async () => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60 * 60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("turns one insertion into one immediate refetch and ignores replayed or foreign events", async () => {
    expect(channels[0].filter).toEqual({ event: "INSERT", schema: "public", table: "sales_events", filter: "store_id=eq.store-1" });
    await emit(channels[0], "event-1");
    expect(fetchMock).toHaveBeenCalledTimes(2); expect(container.textContent).toBe("2");
    await emit(channels[0], "event-1");
    await emit(channels[0], "foreign-store", "store-2");
    await emit(channels[0], "foreign-user", "store-1", "user-2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("waits for foreground after a hidden sale and performs only one refetch on return", async () => {
    visibility = "hidden"; focused = false;
    await emit(channels[0], "event-hidden"); expect(fetchMock).toHaveBeenCalledTimes(1);
    visibility = "visible";
    await act(async () => { document.dispatchEvent(new dom.window.Event("visibilitychange")); window.dispatchEvent(new dom.window.Event("online")); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    focused = true;
    await act(async () => { window.dispatchEvent(new dom.window.Event("focus")); window.dispatchEvent(new dom.window.Event("online")); document.dispatchEvent(new dom.window.Event("visibilitychange")); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("only uses the 30-minute fallback on a foreground return, never for fresh data", async () => {
    await act(async () => { await vi.advanceTimersByTimeAsync(DASHBOARD_ANALYTICS_FALLBACK_MS - 1); window.dispatchEvent(new dom.window.Event("focus")); window.dispatchEvent(new dom.window.Event("online")); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); window.dispatchEvent(new dom.window.Event("focus")); window.dispatchEvent(new dom.window.Event("online")); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("keeps manual refresh immediate for fresh data", async () => {
    await act(async () => { container.querySelector("button")!.click(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toEqual({ cache: "no-store", headers: { "x-vendeo-refresh": "1" } });
  });
  it("removes the old subscription on store change and ignores its late callbacks", async () => {
    const old = channels[0]; await render("store-2");
    expect(removeChannel).toHaveBeenCalledWith(old);
    expect(channels[1].filter?.filter).toBe("store_id=eq.store-2");
    const before = fetchMock.mock.calls.length;
    await emit(old, "late-event"); expect(fetchMock).toHaveBeenCalledTimes(before);
    await emit(channels[1], "new-store-event", "store-2"); expect(fetchMock).toHaveBeenCalledTimes(before + 1);
    await act(async () => root.unmount()); expect(removeChannel).toHaveBeenCalledWith(channels[1]);
    root = createRoot(container);
  });
});
