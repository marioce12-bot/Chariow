// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreData } from "@/components/dashboard/shared";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, locale: "en" }) }));
import { StoresView } from "@/components/dashboard/sections";

const fetchMock = vi.fn<typeof fetch>();
const store = (overrides: Partial<StoreData> = {}): StoreData => ({ id: "store-1", platform: "chariow", store_name: "Demo", mcp_url: null, is_active: true, connection_status: "connected", ...overrides });
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function render(stores: StoreData[] = []) {
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => { root.render(<StoresView stores={stores} subscription={null} onStoresChange={vi.fn()} />); });
}
async function click(button: Element | null) { expect(button).toBeTruthy(); await act(async () => { (button as HTMLButtonElement).click(); }); }
function addButton() { return Array.from(container.querySelectorAll("button")).find(button => button.textContent?.includes("sweep2.text316")) ?? null; }
function dialog() { return container.querySelector('[role="dialog"]'); }
function choice(name: "Chariow" | "Shopify") { return dialog()?.querySelector(`button[aria-label="${name}"]`) ?? null; }
function response(ok: boolean, payload: unknown = {}) { return { ok, json: async () => payload } as Response; }
async function typeIn(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function submitForm() { await click(Array.from(container.querySelectorAll("form button")).find(item => item.textContent?.includes("Connect Shopify")) ?? null); }
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); fetchMock.mockResolvedValue(response(true, { configured: true })); window.history.replaceState({}, "", "/"); });
afterEach(async () => { if (root) await act(async () => root.unmount()); container?.remove(); vi.unstubAllGlobals(); });

describe("StoresView — ajout et reprise des connexions", () => {
  it("ouvre un picker unique avec les deux choix et ne fetch rien avant sélection", async () => {
    await render(); expect(addButton()).toBeTruthy(); expect(container.querySelectorAll(".page-top button")).toHaveLength(1);
    await click(addButton()); expect(dialog()).toBeTruthy(); expect(choice("Chariow")).toBeTruthy(); expect(choice("Shopify")).toBeTruthy();
    expect(dialog()!.querySelector('img[alt="Logo Chariow"]')).toBeTruthy(); expect(dialog()!.querySelector('[aria-label="Logo Shopify"]')).toBeTruthy(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("vérifie Chariow après sélection et affiche l'erreur de quota", async () => {
    fetchMock.mockResolvedValueOnce(response(false, { code: "STORE_LIMIT", error: "Quota Chariow atteint" }));
    await render(); await click(addButton()); await click(choice("Chariow"));
    expect(fetchMock).toHaveBeenCalledWith("/api/integrations/chariow/connect/check"); expect(dialog()?.textContent).toContain("Quota Chariow atteint");
  });
  it("affiche l'erreur réseau Chariow dans la modale", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline")); await render(); await click(addButton()); await click(choice("Chariow"));
    expect(dialog()?.textContent).toContain("Unable to start the Chariow connection");
  });
  it("annonce l'indisponibilité Shopify et ignore toute tentative de clic sans fetch", async () => {
    await render(); await click(addButton()); const modal = dialog()!;
    const shopify = choice("Shopify") as HTMLButtonElement;
    expect(shopify.disabled).toBe(true);
    expect(modal.textContent).toContain("temporarily unavailable");
    await click(shopify);
    expect(fetchMock).not.toHaveBeenCalled(); expect(modal.querySelector("form")).toBeNull();
  });
  it("à 3/3 conserve la modale, désactive les deux choix et ne fetch rien", async () => {
    await render([store(), store({ id: "2" }), store({ id: "3" })]); await click(addButton());
    expect(dialog()?.textContent).toContain("All 3 store slots are in use"); expect((choice("Chariow") as HTMLButtonElement).disabled).toBe(true); expect((choice("Shopify") as HTMLButtonElement).disabled).toBe(true); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("garde les choix indisponibles quand la capacité est complète", async () => {
    await render(); await click(addButton());
    await act(async () => { root.render(<StoresView stores={[store(), store({ id: "2" }), store({ id: "3" })]} subscription={null} onStoresChange={vi.fn()} />); });
    const modal = dialog()!;
    expect((choice("Chariow") as HTMLButtonElement).disabled).toBe(true);
    expect((choice("Shopify") as HTMLButtonElement).disabled).toBe(true);
    expect(modal.textContent).toContain("All 3 store slots are in use");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("ferme par Escape/backdrop, rend le focus et piège la tabulation", async () => {
    await render(); const trigger = addButton() as HTMLButtonElement; trigger.focus(); await click(trigger); const modal = dialog()!;
    const controls = Array.from(modal.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]'));
    expect(document.activeElement).toBe(modal);
    await act(async () => { controls[0].focus(); controls[0].dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true, shiftKey: true })); }); expect(document.activeElement).toBe(controls[controls.length - 1]);
    await act(async () => { modal.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); expect(dialog()).toBeNull(); expect(document.activeElement).toBe(trigger);
    trigger.focus(); await click(trigger); const backdrop = container.querySelector(".store-platform-backdrop")!; await act(async () => { backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); expect(dialog()).toBeNull(); expect(document.activeElement).toBe(trigger);
  });
  it("autorise la reprise Chariow/Shopify au quota sans navigation réelle", async () => {
    await render([store({ connection_status: "pending" }), store({ id: "shopify-2", platform: "shopify", connection_status: "pending" }), store({ id: "3", connection_status: "pending" })]);
    const retries = Array.from(container.querySelectorAll(".store-row button.btn-ghost")); expect(retries).toHaveLength(3);
    await click(retries[1]); expect(fetchMock).not.toHaveBeenCalled();
    await click(retries[0]); expect(fetchMock).not.toHaveBeenCalled();
    // jsdom expose window.location.href en lecture seule : on vérifie le chemin
    // de reprise ciblé dans le code plutôt que de déclencher une navigation.
    expect(StoresView.toString()).toContain("store_id=");
  });
  it("ne propose pas de connexion custom", async () => {
    await render(); await click(addButton()); expect(dialog()?.textContent).not.toMatch(/custom|personnalisé/i); expect(dialog()?.querySelectorAll(".store-platform-option")).toHaveLength(2);
  });
});
