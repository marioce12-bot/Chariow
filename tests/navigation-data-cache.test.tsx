// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavigationCache, NavigationDataProvider, useNavigationCache, useNavigationData } from "@/components/dashboard/NavigationDataCache";

let root: Root | undefined;
let host: HTMLDivElement;
const response = (data: unknown) => ({ ok: true, json: async () => data });
async function mount(element: React.ReactNode) {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root!.render(element));
}
async function click(text: string) {
  await act(async () => { Array.from(host.querySelectorAll("button")).find((button) => button.textContent === text)!.click(); });
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); host?.remove(); root = undefined; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function Reading({ url }: { url: string }) {
  const reading = useNavigationData<{ marker: string }>(url);
  return <output data-loading={reading.loading} data-refreshing={reading.refreshing}>{reading.data?.marker ?? "loading"}</output>;
}
function Harness() {
  const [section, setSection] = useState("home");
  const [store, setStore] = useState("a");
  const [account, setAccount] = useState("1");
  const cache = useNavigationCache();
  return <><button onClick={() => setSection("home")}>Accueil</button><button onClick={() => setSection("ads")}>Publicités</button><button onClick={() => setStore("b")}>Boutique B</button><button onClick={() => setAccount("2")}>Compte 2</button><button onClick={() => cache.invalidate()}>Mutation réussie</button>{section === "home" ? <Reading key="home" url={`/api/analytics?store_id=${store}`} /> : <Reading key="ads" url={`/api/meta/performance?account_id=${account}&store_id=${store}`} />}</>;
}
describe("navigation data cache", () => {
  it("keeps Accueil→Publicités→Accueil readings and refetches only after a mutation", async () => {
    let revision = 1;
    const fetcher = vi.fn(async (url: string) => response({ marker: `${url}:v${revision}` }));
    vi.stubGlobal("fetch", fetcher);
    await mount(<NavigationDataProvider><Harness /></NavigationDataProvider>);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await click("Publicités"); expect(fetcher).toHaveBeenCalledTimes(2);
    await click("Accueil"); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(host.querySelector("output")!.dataset.loading).toBe("false");
    expect(host.textContent).toContain("/api/analytics?store_id=a:v1");
    revision = 2; await click("Mutation réussie");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(host.textContent).toContain("/api/analytics?store_id=a:v2");
    await click("Publicités"); expect(fetcher).toHaveBeenCalledTimes(4);
    expect(host.textContent).toContain("account_id=1&store_id=a:v2");
  });
  it("never shows another store/account reading while the new identity is loading", async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn((url: string) => url.includes("store_id=b") || url.includes("account_id=2") ? new Promise((r) => { resolve = r; }) : Promise.resolve(response({ marker: url }))));
    await mount(<NavigationDataProvider><Harness /></NavigationDataProvider>);
    await click("Boutique B");
    expect(host.querySelector("output")!.textContent).toBe("loading");
    await act(async () => { resolve(response({ marker: "boutique-b" })); });
    expect(host.textContent).toContain("boutique-b");
    await click("Publicités");
    await act(async () => { resolve(response({ marker: "compte-1" })); });
    await click("Compte 2");
    expect(host.querySelector("output")!.textContent).toBe("loading");
    expect(host.textContent).not.toContain("compte-1");
  });
  it("deduplicates concurrent requests, refreshes stale data discreetly and keeps it after failure", async () => {
    const cache = new NavigationCache();
    let clock = 100_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const fetcher = vi.fn(async () => response({ marker: "usable" })); vi.stubGlobal("fetch", fetcher);
    await Promise.all([cache.load("/one"), cache.load("/one")]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await cache.load("/one"); expect(fetcher).toHaveBeenCalledTimes(1);
    clock += 61_000;
    let reject!: (reason: Error) => void;
    fetcher.mockImplementationOnce(() => new Promise((_r, rej) => { reject = rej; }));
    const refresh = cache.load("/one");
    expect(cache.snapshot("/one")).toMatchObject({ data: { marker: "usable" }, loading: false, refreshing: true });
    reject(new Error("offline")); await refresh;
    expect(cache.snapshot("/one")).toMatchObject({ data: { marker: "usable" }, loading: false, error: true });
    await cache.load("/one"); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not cache an abandoned computed reading as a fresh empty result", async () => {
    const cache = new NavigationCache();
    await cache.loadComputed("ads", async () => undefined);
    const retry = vi.fn(async () => ({ marker: "ready" }));
    await cache.loadComputed("ads", retry);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(cache.snapshot("ads").data).toEqual({ marker: "ready" });
    cache.invalidate();
    await cache.loadComputed("ads", async () => undefined);
    expect(cache.snapshot("ads").data).toEqual({ marker: "ready" });
  });
  it("rejects in-flight pre-mutation responses and isolates workspace instances", async () => {
    const first = new NavigationCache(); const second = new NavigationCache();
    let resolve!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => { resolve = r; })));
    const old = first.load("/private");
    first.invalidate();
    const oldResolve = resolve;
    const next = first.load("/private");
    resolve(response({ marker: "new" })); await next;
    oldResolve(response({ marker: "old" })); await old;
    expect(first.snapshot("/private").data).toEqual({ marker: "new" });
    expect(second.snapshot("/private").data).toBeUndefined();
    first.clear(); expect(first.snapshot("/private").data).toBeUndefined();
  });
});
