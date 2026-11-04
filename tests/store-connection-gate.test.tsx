import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { StoreData } from "@/components/dashboard/shared";
const language = vi.hoisted(() => ({ locale: "fr" }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: language.locale }) }));
import { StoreConnectionGate, hasConnectedChariowStore, getChariowConnectTarget, shouldShowStoreConnectionGate } from "@/components/dashboard/StoreConnectionGate";
const { JSDOM } = require("jsdom");
const store = (status: string, platform = "chariow"): StoreData => ({ id: "shop/1", platform, store_name: "Test", is_active: true, mcp_url: null, connection_status: status });
let root: ReturnType<typeof createRoot> | undefined;
let dom: any;
function setup() {
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://vendeo-studio.site/dashboard" });
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.getElementById("root")!);
}
async function render(stores: StoreData[] = [], failed = false, onSignOut = vi.fn(), onConnectStart?: () => void | Promise<void>) {
  await act(async () => root!.render(<StoreConnectionGate stores={stores} failed={failed} onSignOut={onSignOut} onConnectStart={onConnectStart} />));
  return onSignOut;
}
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find(item => item.textContent?.includes(text));
  if (!button) throw new Error(`Missing button: ${text}`);
  await act(async () => button.click());
  return button;
}
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; dom?.window.close(); vi.unstubAllGlobals(); language.locale = "fr"; });

describe("store connection gate", () => {
  it("only unlocks after a genuinely connected Chariow store", () => {
    expect(hasConnectedChariowStore([])).toBe(false);
    for (const status of ["pending", "failed", "expired", "revoked", "disconnected"]) expect(hasConnectedChariowStore([store(status)])).toBe(false);
    expect(hasConnectedChariowStore([store("connected", "selar")])).toBe(false);
    expect(hasConnectedChariowStore([store("failed"), store("connected")])).toBe(true);
  });
  it("does not mistake offline or failed store loading for a missing connection", () => {
    expect(shouldShowStoreConnectionGate({ stores: [], loading: false, loadFailed: true, offline: false, subscriptionExpired: false })).toBe(false);
    expect(shouldShowStoreConnectionGate({ stores: [], loading: false, loadFailed: false, offline: true, subscriptionExpired: false })).toBe(false);
    expect(shouldShowStoreConnectionGate({ stores: [], loading: false, loadFailed: false, offline: false, subscriptionExpired: false })).toBe(true);
  });
  it("preserves the existing Chariow connection target helper", () => {
    expect(getChariowConnectTarget([])).toBe("/api/integrations/chariow/connect");
    expect(getChariowConnectTarget([store("failed")])).toBe("/api/integrations/chariow/connect?store_id=shop%2F1");
    expect(getChariowConnectTarget([store("connected")])).toBe("/api/integrations/chariow/connect");
  });
  it("offers the existing-store route and a dedicated guided path for users without a store", async () => {
    setup(); await render();
    const initial = document.querySelector('[role="dialog"]')!.textContent!;
    expect(initial).toContain("As-tu déjà une boutique Chariow ?");
    expect(initial).toContain("J’ai déjà une boutique");
    expect(initial).toContain("Je n’ai pas encore de boutique");
    expect(initial).not.toContain("Shopify");
    expect(document.querySelector("input")).toBeNull();
    await click("Je n’ai pas encore de boutique");
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Tu viens peut-être de découvrir une belle opportunité");
    await click("Continuer");
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Crée ton compte Chariow");
    expect(document.querySelector('a[href="https://chariow.com"]')?.getAttribute("target")).toBe("_blank");
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("J’ai déjà créé ma boutique");
  });
  it("renders the no-store onboarding route in English", async () => {
    language.locale = "en"; setup(); await render();
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Do you already have a Chariow store?");
    await click("I don’t have a store yet");
    await click("Continue");
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Create or sign in to your Chariow account");
    expect(document.querySelector('a[href="https://chariow.com"]')?.textContent).toContain("Create a Chariow account");
  });
  it("runs the existing Chariow preflight and shows the same failure without navigating", async () => {
    setup(); const fetcher = vi.fn().mockResolvedValue({ ok: false }); vi.stubGlobal("fetch", fetcher);
    const assign = vi.fn(); vi.stubGlobal("location", { assign });
    await render(); await click("J’ai déjà une boutique"); await click("Chariow");
    expect(fetcher).toHaveBeenCalledWith("/api/integrations/chariow/connect/check");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Impossible de démarrer la connexion. Vérifie ta connexion et réessaie.");
    expect(assign).not.toHaveBeenCalled();
  });
  it("skips the check for an existing store_id and assigns the unchanged target", async () => {
    setup(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await render([store("failed")]); await click("J’ai déjà une boutique"); await click("Chariow");
    expect(fetcher).not.toHaveBeenCalled(); expect(document.querySelector('[role="alert"]')).toBeNull();
  });
  it("focus-traps the initial choices back to sign-out", async () => {
    setup(); await render();
    expect(document.activeElement?.getAttribute("role")).toBe("dialog");
    const dialog = document.querySelector('[role="dialog"]')!;
    const signOut = [...dialog.querySelectorAll("button")].find(button => button.textContent?.includes("Se déconnecter"))!;
    const existingStore = [...dialog.querySelectorAll("button")].find(button => button.textContent?.includes("J’ai déjà une boutique"))!;
    const event = () => new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    existingStore.focus(); act(() => dialog.dispatchEvent(event()));
    expect(document.activeElement).toBe(signOut);
    act(() => dialog.dispatchEvent(event())); expect(document.activeElement).toBe(signOut);
    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
  });
  it("awaits onboarding callback after successful preflight and before assigning Chariow target", async () => {
    setup();
    const order: string[] = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const callback = vi.fn(async () => { await Promise.resolve(); order.push("callback"); });
    await render([], false, vi.fn(), callback);
    await click("J’ai déjà une boutique"); await click("Chariow");
    expect(callback).toHaveBeenCalledOnce();
    expect(order).toEqual(["callback"]);
    expect(readFileSync("components/dashboard/StoreConnectionGate.tsx", "utf8")).toContain("await onConnectStart?.();");
  });
  it("keeps failed auth feedback and sign-out available", async () => {
    setup(); const signOut = vi.fn(); await render([], true, signOut);
    await click("J’ai déjà une boutique");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("La connexion n’a pas abouti");
    await click("Se déconnecter"); expect(signOut).toHaveBeenCalledOnce();
  });
  it("keeps dashboard auth gate and real sections intact", () => {
    const source = readFileSync("components/Dashboard.tsx", "utf8");
    expect(source).not.toContain("<StoreOnboarding"); expect(source).toContain("inert={needsStoreConnection");
    expect(source).toContain("needsStoreConnection && <StoreConnectionGate");
    expect(source).toContain('if (s === "connected") {\n      setActive(DEFAULT_DASHBOARD_SECTION)');
  });
});
