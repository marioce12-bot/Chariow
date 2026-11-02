import { afterEach, describe, expect, it, vi } from "vitest";
import { NavigationCache, scheduleNavigationRefresh } from "./NavigationDataCache";
import { DASHBOARD_ANALYTICS_FALLBACK_MS } from "@/lib/dashboard-analytics-periods";

class FakeEvents {
  private listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    listeners.add(listener); this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) { this.listeners.get(type)?.delete(listener); }
  dispatch(type: string) { this.listeners.get(type)?.forEach(listener => typeof listener === "function" ? listener(new Event(type)) : listener.handleEvent(new Event(type))); }
}
class FakeDocument extends FakeEvents {
  visibilityState: DocumentVisibilityState = "visible";
  focused = true;
  hasFocus() { return this.focused; }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function clock() { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-01T08:00:00.000Z")); }

describe("Event-driven analytics cache", () => {
  it("creates no timer and makes no idle analytics request even after hours", async () => {
    clock();
    const refresh = vi.fn();
    const stop = scheduleNavigationRefresh(refresh, 0, new FakeDocument() as unknown as Document, new FakeEvents() as unknown as Window, true);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(3 * 60 * 60_000);
    expect(refresh).not.toHaveBeenCalled();
    stop();
  });

  it("only reloads a stale foreground reading and deduplicates return events", async () => {
    clock();
    const cache = new NavigationCache();
    const url = "/api/analytics?store_id=one";
    const loader = vi.fn(async () => ({ receivedAt: Date.now() }));
    await cache.loadComputed(url, loader, 0, false, DASHBOARD_ANALYTICS_FALLBACK_MS);
    const doc = new FakeDocument(); const win = new FakeEvents();
    const stop = scheduleNavigationRefresh(() => { void cache.loadComputed(url, loader, 0, false, DASHBOARD_ANALYTICS_FALLBACK_MS); }, 0, doc as unknown as Document, win as unknown as Window, true);
    await vi.advanceTimersByTimeAsync(DASHBOARD_ANALYTICS_FALLBACK_MS - 1);
    win.dispatch("focus"); win.dispatch("online"); doc.dispatch("visibilitychange");
    await flush(); expect(loader).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    doc.focused = false;
    win.dispatch("focus"); win.dispatch("online"); doc.dispatch("visibilitychange");
    await flush(); expect(loader).toHaveBeenCalledTimes(1);
    doc.focused = true; doc.visibilityState = "hidden";
    win.dispatch("focus"); win.dispatch("online"); doc.dispatch("visibilitychange");
    await flush(); expect(loader).toHaveBeenCalledTimes(1);
    doc.visibilityState = "visible";
    doc.dispatch("visibilitychange"); win.dispatch("focus"); win.dispatch("online");
    await flush(); expect(loader).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(DASHBOARD_ANALYTICS_FALLBACK_MS);
    win.dispatch("focus"); await flush(); expect(loader).toHaveBeenCalledTimes(2);
  });

  it("manual refresh bypasses a fresh client entry and sends the force header without browser caching", async () => {
    clock();
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const cache = new NavigationCache(); const url = "/api/analytics?store_id=one";
    await cache.load(url, 0, false, DASHBOARD_ANALYTICS_FALLBACK_MS);
    await cache.load(url, 0, false, DASHBOARD_ANALYTICS_FALLBACK_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await cache.load(url, 0, true, DASHBOARD_ANALYTICS_FALLBACK_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]).toEqual([url, { cache: "no-store", headers: { "x-vendeo-refresh": "1" } }]);
  });

  it("a sale expires analytics for only its store, not other stores or endpoint data", async () => {
    clock(); const cache = new NavigationCache();
    const first = vi.fn(async () => ({ store: "one" }));
    const second = vi.fn(async () => ({ store: "two" }));
    const ads = vi.fn(async () => []);
    await cache.loadComputed("/api/analytics?store_id=one&dashboard_periods=1", first);
    await cache.loadComputed("/api/analytics?store_id=two", second);
    await cache.loadComputed("/api/ad-campaigns", ads);
    cache.invalidateAnalyticsStore("one");
    await Promise.all([
      cache.loadComputed("/api/analytics?store_id=one&dashboard_periods=1", first),
      cache.loadComputed("/api/analytics?store_id=two", second),
      cache.loadComputed("/api/ad-campaigns", ads),
    ]);
    expect(first).toHaveBeenCalledTimes(2); expect(second).toHaveBeenCalledTimes(1); expect(ads).toHaveBeenCalledTimes(1);
  });

  it("shares simultaneous identical loads and discards obsolete in-flight results after a sale", async () => {
    clock(); const cache = new NavigationCache(); const url = "/api/analytics?store_id=one";
    let resolveOld!: (value: { version: number }) => void;
    const oldLoader = vi.fn(() => new Promise<{ version: number }>(resolve => { resolveOld = resolve; }));
    const first = cache.loadComputed(url, oldLoader); const duplicate = cache.loadComputed(url, oldLoader);
    expect(oldLoader).toHaveBeenCalledTimes(1);
    cache.invalidateAnalyticsStore("one");
    await cache.loadComputed(url, async () => ({ version: 2 }));
    resolveOld({ version: 1 }); await Promise.all([first, duplicate]);
    expect(cache.snapshot(url).data).toEqual({ version: 2 });
  });
});
