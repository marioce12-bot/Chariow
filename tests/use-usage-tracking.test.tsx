// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearUsageSessionStorage, useUsageTracking } from "@/components/useUsageTracking";

function Harness({ section }: { section: string }) {
  useUsageTracking(section);
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount(section = "Pub") {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(createElement(Harness, { section })); });
}

async function unmount() {
  if (root) await act(async () => { root!.unmount(); });
  root = null;
  container?.remove();
  container = null;
}

function setVisibility(value: DocumentVisibilityState) {
  act(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });
  vi.useFakeTimers({ now: Date.UTC(2026, 9, 24, 12) });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: vi.fn(() => true) });
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  window.sessionStorage.clear();
});

describe("useUsageTracking", () => {
  it("backs off after consecutive failures and stops after the third", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await mount();

    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(19_999); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(39_999); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("suspends scheduled heartbeats while hidden and resumes when visible", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await mount();

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    setVisibility("hidden");
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).not.toHaveBeenCalled();

    setVisibility("visible");
    await act(async () => { await vi.advanceTimersByTimeAsync(19_999); });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears only tracking session keys and preserves other session storage", () => {
    window.sessionStorage.setItem("vendeo_usage_session_id", "old-session");
    window.sessionStorage.setItem("vendeo_usage_session_activity_at", "123");
    window.sessionStorage.setItem("vendeo_dashboard_active_section", "Studio");

    clearUsageSessionStorage();

    expect(window.sessionStorage.getItem("vendeo_usage_session_id")).toBeNull();
    expect(window.sessionStorage.getItem("vendeo_usage_session_activity_at")).toBeNull();
    expect(window.sessionStorage.getItem("vendeo_dashboard_active_section")).toBe("Studio");
  });
});
