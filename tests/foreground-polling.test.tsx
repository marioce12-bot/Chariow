// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationCenter } from "@/components/NotificationCenter";
import { AutopilotView } from "@/components/vendeo/AutopilotView";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
let hasFocus = true;
let visible = "visible";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  hasFocus = true; visible = "visible";
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visible });
  Object.defineProperty(document, "hasFocus", { configurable: true, value: () => hasFocus });
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ unreadCount: 3, reports: [], campaigns: [], alerts: [] }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const tick = async (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("foreground polling", () => {
  it("NotificationCenter skips hidden/unfocused polling, refreshes once on foreground return, and is immediately usable", async () => {
    await act(async () => { root.render(<NotificationCenter onOpen={vi.fn()} />); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    visible = "hidden"; hasFocus = false;
    await tick(12 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    visible = "visible";
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    hasFocus = true;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await tick(12 * 60_000 - 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await tick(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.textContent).toContain("3");
  });

  it("Autopilot skips hidden/unfocused intervals, refreshes on foreground return without a burst, and manual retry runs immediately", async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ reports: [], campaigns: [], alerts: [] }) }));
    await act(async () => { root.render(<AutopilotView />); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    visible = "hidden"; hasFocus = false;
    await tick(5 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    visible = "visible";
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    hasFocus = true;
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await act(async () => { window.dispatchEvent(new Event("focus")); document.dispatchEvent(new Event("visibilitychange")); });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await tick(5 * 60_000 - 1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await tick(1);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    // Manual retry must bypass the automatic freshness window.
    fetchMock.mockImplementation(async (url: string) => url === "/api/autopilot/reports"
      ? ({ ok: false, status: 503, json: async () => ({}) })
      : ({ ok: true, json: async () => ({ alerts: [] }) }));
    await tick(5 * 60_000);
    const retry = container.querySelector<HTMLButtonElement>('[role="alert"] button');
    expect(retry).toBeTruthy();
    await act(async () => { retry!.click(); await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});
