import { afterEach, describe, expect, it, vi } from "vitest";
import { NavigationCache, scheduleNavigationRefreshFromCompletion } from "./NavigationDataCache";
import { DASHBOARD_ANALYTICS_REFRESH_MS } from "@/lib/dashboard-analytics-periods";

class FakeEvents {
  private listeners = new Map<string, Set<() => void>>();
  private wrappers = new Map<EventListenerOrEventListenerObject, () => void>();
  private wrap(type: string, listener: EventListenerOrEventListenerObject) {
    let callback = this.wrappers.get(listener);
    if (!callback) {
      callback = typeof listener === "function" ? () => listener(new Event(type)) : () => listener.handleEvent(new Event(type));
      this.wrappers.set(listener, callback);
    }
    return callback;
  }
  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callback = this.wrap(type, listener);
    const callbacks = this.listeners.get(type) ?? new Set<() => void>();
    callbacks.add(callback);
    this.listeners.set(type, callbacks);
  }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const callbacks = this.listeners.get(type);
    if (!callbacks) return;
    const callback = this.wrappers.get(listener);
    if (callback) callbacks.delete(callback);
  }
  dispatch(type: string) { this.listeners.get(type)?.forEach((listener) => listener()); }
}

class FakeDocument extends FakeEvents {
  visibilityState: DocumentVisibilityState = "visible";
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => vi.useRealTimers());

describe("Dashboard analytics refresh schedule", () => {
  it("fires the first poll exactly five minutes after the initial response, never before", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T08:00:00.000Z"));
    const startedAt = Date.now();
    const cache = new NavigationCache();
    const callTimes: number[] = [];
    const loader = vi.fn()
      .mockImplementationOnce(async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 12_000));
        callTimes.push(Date.now());
        return { receivedAt: Date.now() };
      })
      .mockImplementation(async () => {
        callTimes.push(Date.now());
        return { receivedAt: Date.now() };
      });
    const doc = new FakeDocument();
    const win = new FakeEvents();
    const initialLoad = cache.loadComputed("dashboard-analytics", loader, 0, false, DASHBOARD_ANALYTICS_REFRESH_MS);
    const stop = scheduleNavigationRefreshFromCompletion(
      () => cache.loadComputed("dashboard-analytics", loader, 0, false, DASHBOARD_ANALYTICS_REFRESH_MS),
      () => cache.millisecondsUntilRefresh("dashboard-analytics", DASHBOARD_ANALYTICS_REFRESH_MS),
      doc as unknown as Document,
      win as unknown as Window,
      initialLoad,
    );

    await vi.advanceTimersByTimeAsync(12_000);
    await flushPromises();
    expect(loader).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DASHBOARD_ANALYTICS_REFRESH_MS - 1);
    expect(loader).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(loader).toHaveBeenCalledTimes(2);
    expect(callTimes).toEqual([startedAt + 12_000, startedAt + 12_000 + DASHBOARD_ANALYTICS_REFRESH_MS]);

    await vi.advanceTimersByTimeAsync(DASHBOARD_ANALYTICS_REFRESH_MS - 1);
    expect(loader).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(loader).toHaveBeenCalledTimes(3);
    expect(callTimes[2]).toBe(callTimes[1] + DASHBOARD_ANALYTICS_REFRESH_MS);
    stop();
  });

  it("makes no request while hidden and makes exactly one stale request on visible return", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T08:00:00.000Z"));
    const cache = new NavigationCache();
    const loader = vi.fn(async () => ({ receivedAt: Date.now() }));
    await cache.loadComputed("dashboard-analytics", loader, 0, false, DASHBOARD_ANALYTICS_REFRESH_MS);
    const doc = new FakeDocument();
    const win = new FakeEvents();
    const stop = scheduleNavigationRefreshFromCompletion(
      () => cache.loadComputed("dashboard-analytics", loader, 0, false, DASHBOARD_ANALYTICS_REFRESH_MS),
      () => cache.millisecondsUntilRefresh("dashboard-analytics", DASHBOARD_ANALYTICS_REFRESH_MS),
      doc as unknown as Document,
      win as unknown as Window,
      cache.loadComputed("dashboard-analytics", loader, 0, false, DASHBOARD_ANALYTICS_REFRESH_MS),
    );

    doc.visibilityState = "hidden";
    doc.dispatch("visibilitychange");
    await vi.advanceTimersByTimeAsync(DASHBOARD_ANALYTICS_REFRESH_MS);
    await vi.advanceTimersByTimeAsync(DASHBOARD_ANALYTICS_REFRESH_MS);
    win.dispatch("focus");
    win.dispatch("online");
    doc.dispatch("visibilitychange");
    await flushPromises();
    expect(loader).toHaveBeenCalledTimes(1);

    doc.visibilityState = "visible";
    doc.dispatch("visibilitychange");
    win.dispatch("focus");
    win.dispatch("online");
    await flushPromises();
    expect(loader).toHaveBeenCalledTimes(2);
    stop();
    await vi.advanceTimersByTimeAsync(DASHBOARD_ANALYTICS_REFRESH_MS);
    await flushPromises();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
