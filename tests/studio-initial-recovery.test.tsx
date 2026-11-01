// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioView } from "../components/dashboard/sections";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
const product = { id: "studio-recovery-test", name: "Produit", image: "https://example.test/product.jpg" };
const response = (data: unknown, ok = true) => Promise.resolve({ ok, json: async () => data });
beforeEach(() => {
  vi.useFakeTimers(); window.sessionStorage.clear();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  fetchMock = vi.fn(async (url: string) => url === "/api/studio/tasks" ? response({ tasks: [] }) : response({ items: [], nextCursor: null }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("Studio initial task recovery", () => {
  it("does one GET after a successful initial recovery, with no permanent polling", async () => {
    await act(async () => { root.render(<StudioView products={[product]} />); });
    const initialGets = fetchMock.mock.calls.filter(([url]) => url === "/api/studio/tasks").length;
    expect(initialGets).toBeGreaterThan(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/studio/tasks")).toHaveLength(initialGets);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
  it("retries a failed initial GET, then stops after the retry succeeds", async () => {
    let calls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/studio/tasks") { calls++; return response({ tasks: [] }, calls > 1); }
      return response({ items: [], nextCursor: null });
    });
    await act(async () => { root.render(<StudioView products={[product]} />); });
    const initialGets = calls;
    expect(initialGets).toBeGreaterThan(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_999); });
    expect(calls).toBe(initialGets);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(calls).toBe(initialGets + 1);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(calls).toBe(initialGets + 1);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
});
