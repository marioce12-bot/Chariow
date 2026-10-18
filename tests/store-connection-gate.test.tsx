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
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; dom?.window.close(); vi.unstubAllGlobals(); language.locale = "fr"; });

describe("Chariow onboarding overlay", () => {
  it("only unlocks after a genuinely connected Chariow store", () => {
    expect(hasConnectedChariowStore([])).toBe(false);
    for (const status of ["pending", "failed", "expired", "revoked", "disconnected"]) expect(hasConnectedChariowStore([store(status)])).toBe(false);
    expect(hasConnectedChariowStore([store("connected", "selar")])).toBe(false);
    expect(hasConnectedChariowStore([store("failed"), store("connected")])).toBe(true);
  });
  it("reuses a failed or pending store instead of consuming a new slot", () => {
    expect(getChariowConnectTarget([])).toBe("/api/integrations/chariow/connect");
    expect(getChariowConnectTarget([store("failed")])).toBe("/api/integrations/chariow/connect?store_id=shop%2F1");
  });
  it("has complete French and English modal copy and retry feedback", () => {
    const fr = renderToStaticMarkup(<StoreConnectionGate stores={[]} failed onSignOut={() => {}} />);
    expect(fr).toContain("Connecter ma boutique"); expect(fr).toContain('aria-modal="true"'); expect(fr).toContain("La connexion n’a pas abouti");
    language.locale = "en";
    const en = renderToStaticMarkup(<StoreConnectionGate stores={[]} failed onSignOut={() => {}} />);
    expect(en).toContain("Connect my store"); expect(en).toContain("The connection was not completed"); expect(en).not.toContain("Connecter ma boutique");
  });
  it("focuses the modal, traps Tab and handles a failed preflight without leaving", async () => {
    dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://vendeo-studio.site/dashboard" });
    vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const fetcher = vi.fn().mockResolvedValue({ ok: false }); vi.stubGlobal("fetch", fetcher);
    root = createRoot(document.getElementById("root")!);
    await act(async () => root!.render(<StoreConnectionGate stores={[]} failed={false} onSignOut={() => {}} />));
    expect(document.activeElement?.getAttribute("role")).toBe("dialog");
    const dialog = document.querySelector('[role="dialog"]')!;
    act(() => dialog.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
    expect(document.activeElement?.textContent).toContain("Connecter ma boutique");
    await act(async () => (document.querySelector("button") as HTMLButtonElement).click());
    expect(fetcher).toHaveBeenCalledWith("/api/integrations/chariow/connect/check");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Impossible de démarrer");
    expect((document.querySelector("button") as HTMLButtonElement).disabled).toBe(false);
    expect(document.body.style.overflow).toBe("hidden");
  });
  it("renders real sections instead of replacing them with an onboarding page", () => {
    const source = readFileSync("components/Dashboard.tsx", "utf8");
    expect(source).not.toContain("<StoreOnboarding");
    expect(source).toContain("inert={needsStoreConnection");
    expect(source).toContain("needsStoreConnection && <StoreConnectionGate");
    expect(source).toContain('if (s === "connected") {\n      setActive(DEFAULT_DASHBOARD_SECTION)');
  });
});
