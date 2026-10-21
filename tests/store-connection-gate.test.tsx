import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { StoreData } from "@/components/dashboard/shared";
const language = vi.hoisted(() => ({ locale: "fr" }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: language.locale }) }));
import { StoreConnectionGate, hasConnectedChariowStore, getChariowConnectTarget } from "@/components/dashboard/StoreConnectionGate";
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
async function render(stores: StoreData[] = [], failed = false, onSignOut = vi.fn()) {
  await act(async () => root!.render(<StoreConnectionGate stores={stores} failed={failed} onSignOut={onSignOut} />));
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
  it("preserves the existing Chariow connection target helper", () => {
    expect(getChariowConnectTarget([])).toBe("/api/integrations/chariow/connect");
    expect(getChariowConnectTarget([store("failed")])).toBe("/api/integrations/chariow/connect?store_id=shop%2F1");
    expect(getChariowConnectTarget([store("connected")])).toBe("/api/integrations/chariow/connect");
  });
  it("shows neutral French intro without Chariow, then opens selector and returns", async () => {
    setup(); await render();
    const initial = document.querySelector('[role="dialog"]')!.textContent!;
    expect(initial).toContain("Connecte ta boutique"); expect(initial).toContain("Connecter ma boutique");
    expect(initial).not.toContain("Chariow");
    await click("Connecter ma boutique");
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Quel type de boutique ?");
    expect(document.querySelector('[aria-label="Chariow"]')).toBeTruthy();
    expect(document.querySelector('[aria-label="Boutique personnalisée"]')).toBeTruthy();
    await click("Retour"); expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Connecte ta boutique");
  });
  it("renders English labels for intro and selector", async () => {
    language.locale = "en"; setup(); await render();
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Connect your store");
    expect(document.querySelector('[role="dialog"]')!.textContent).not.toContain("Chariow");
    await click("Connect my store");
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Which type of store?");
    expect(document.querySelector('[aria-label="Custom store"]')).toBeTruthy();
    expect(document.querySelector("button[aria-label='Chariow']")).toBeTruthy();
  });
  it("runs the existing Chariow preflight and shows the same failure without navigating", async () => {
    setup(); const fetcher = vi.fn().mockResolvedValue({ ok: false }); vi.stubGlobal("fetch", fetcher);
    const assign = vi.fn(); vi.stubGlobal("location", { assign });
    await render(); await click("Connecter ma boutique"); await click("Chariow");
    expect(fetcher).toHaveBeenCalledWith("/api/integrations/chariow/connect/check");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Impossible de démarrer la connexion. Vérifie ta connexion et réessaie.");
    expect(assign).not.toHaveBeenCalled();
  });
  it("skips the check for an existing store_id and assigns the unchanged target", async () => {
    setup(); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await render([store("failed")]); await click("Connecter ma boutique"); await click("Chariow");
    expect(fetcher).not.toHaveBeenCalled(); expect(document.querySelector('[role="alert"]')).toBeNull();
  });
  it("focus-traps radio and step-heading focus back to sign-out inside the gate", async () => {
    setup(); await render();
    expect(document.activeElement?.getAttribute("role")).toBe("dialog");
    const dialog = document.querySelector('[role="dialog"]')!;
    await click("Connecter ma boutique"); await click("Boutique personnalisée");
    const signOut = [...dialog.querySelectorAll("button")].find(button => button.textContent?.includes("Se déconnecter"))!;
    const csv = dialog.querySelector('input[type="radio"][value="csv"]') as HTMLInputElement;
    await act(async () => csv.click());
    const event = () => new dom.window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    csv.focus(); act(() => dialog.dispatchEvent(event()));
    expect(document.activeElement).toBe(signOut);
    await click("Étape suivante");
    expect(document.activeElement?.textContent).toBe("Préparer les événements de commande");
    act(() => dialog.dispatchEvent(event())); expect(document.activeElement).toBe(signOut);
    expect(document.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
  });
  it("keeps failed auth feedback and sign-out available", async () => {
    setup(); const signOut = vi.fn(); await render([], true, signOut);
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
