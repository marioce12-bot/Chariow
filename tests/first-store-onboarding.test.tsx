// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFirstStoreOnboarding } from "@/components/dashboard/useFirstStoreOnboarding";

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let current: ReturnType<typeof useFirstStoreOnboarding>;
function Harness({ connected = false }: { connected?: boolean }) {
  current = useFirstStoreOnboarding({ userId: "user-1", stores: connected ? [{ id: "s1", platform: "chariow", store_name: "Shop", mcp_url: null, is_active: true, connection_status: "connected" }] : [], loading: false, connected });
  return null;
}
async function mount(connected = false) {
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  await act(async () => { root!.render(createElement(Harness, { connected })); await Promise.resolve(); });
}
afterEach(() => { root?.unmount(); host?.remove(); root = undefined; host = undefined; vi.unstubAllGlobals(); });

describe("useFirstStoreOnboarding", () => {
  it("does not infer eligibility from connected callback alone; welcome requires persisted pending", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ phase: "done" }) })));
    await mount(true);
    expect(current.stage).toBe("closed");
  });
  it("resumes a persisted welcome and tour", async () => {
    let phase = "welcome";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ phase }) })));
    await mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(current.stage).toBe("welcome");
    root?.unmount(); root = undefined; host?.remove(); host = undefined;
    phase = "tour";
    await mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(current.stage).toBe("tour");
  });
  it("persists pending before beginning OAuth and shows welcome after confirmed connection", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? ({ ok: true, json: async () => ({}) } as Response)
      : ({ ok: true, json: async () => ({ eligible: true }) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    await mount(true);
    await act(async () => { await current.beginConnection(); });
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST" && String(init.body).includes('"phase":"pending"'))).toBe(true);
    // The effect receives a server pending marker on OAuth return.
    fetchMock.mockImplementation(async (_input, init) => init?.method === "POST"
      ? ({ ok: true, json: async () => ({}) } as Response)
      : ({ ok: true, json: async () => ({ phase: "pending" }) } as Response));
    await mount(true);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(current.stage).toBe("welcome");
  });
  it("allows replay locally without persistence", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ phase: "done" }) }));
    vi.stubGlobal("fetch", fetchMock);
    await mount();
    await act(async () => { current.replay(); });
    expect(current.stage).toBe("tour");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { current.startTour(); current.dismiss(); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("never rejects beginConnection when persistence fails", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => init?.method === "POST"
      ? ({ ok: false } as Response)
      : ({ ok: true, json: async () => ({ phase: "pending" }) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    await mount();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await expect(current.beginConnection()).resolves.toBeUndefined();
  });
});
