// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n/i18n";
import { SlideshowStudio } from "@/components/studio/SlideshowStudio";

const product = { id: "p1", name: "Produit test", description: "Description existante" };
const processing = { id: "task-1", kind: "slideshow", status: "processing", progress: 5, message: "Génération en cours…", images: [] };
const response = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
const config = () => response({ enabled: true, voiceoverEnabled: true, voiceoverTestAllowed: true, tracks: [] });

let container: HTMLDivElement;
let root: Root;
let fetcher: ReturnType<typeof vi.fn>;
const mount = async () => act(async () => root.render(<I18nProvider><SlideshowStudio locale="fr" product={product} /></I18nProvider>));
const tasksPosts = () => fetcher.mock.calls.filter(([url, init]) => url === "/api/studio/tasks" && (init as RequestInit | undefined)?.method === "POST");
const setup = (balance: unknown, taskPost?: (init: RequestInit) => Response) => {
  fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/config")) return config();
    if (url === "/api/studio/credits") return response(balance);
    if (url === "/api/studio/prompt") return response({ plan: {} });
    if (url === "/api/studio/tasks" && init?.method === "POST") return taskPost ? taskPost(init) : response({ task: processing });
    return response({ tasks: [] });
  });
};
const createButton = () => container.querySelector<HTMLButtonElement>("button.studio-generate");

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  localStorage.clear();
  fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("SlideshowStudio : solde de crédits avant lancement", () => {
  it("bloque Créer et explique pourquoi quand le solde disponible est inférieur au coût", async () => {
    setup({ balance: 80, reserved: 0, transactions: [] });
    await mount();
    expect(createButton()!.disabled).toBe(true);
    expect(container.textContent).toContain("Solde insuffisant");
    expect(container.textContent).toContain("il te reste 80");
    await act(async () => { createButton()!.click(); });
    expect(tasksPosts()).toHaveLength(0);
  });
  it("tient compte des crédits réservés", async () => {
    setup({ balance: 150, reserved: 80, transactions: [] });
    await mount();
    expect(createButton()!.disabled).toBe(true);
    expect(container.textContent).toContain("il te reste 70");
  });
  it("laisse Créer actif et affiche le solde quand il couvre le coût", async () => {
    setup({ balance: 500, reserved: 0, transactions: [] });
    await mount();
    expect(createButton()!.disabled).toBe(false);
    expect(container.textContent).toContain("Solde disponible : 500");
    expect(container.textContent).not.toContain("Solde insuffisant");
  });
  it("ne bloque pas si le solde est illisible (le serveur re-vérifie)", async () => {
    setup({ tasks: [] });
    await mount();
    expect(createButton()!.disabled).toBe(false);
    expect(container.textContent).not.toContain("Solde disponible");
  });
  it("affiche le message du serveur sur un 402 INSUFFICIENT_CREDITS sans passer en « lancement non confirmé »", async () => {
    const serverMessage = "Solde insuffisant : ce diaporama coûte 100 crédits Studio, il te reste 40. Recharge tes crédits avant de créer.";
    setup({ balance: 500, reserved: 0, transactions: [] }, () => response({ code: "INSUFFICIENT_CREDITS", error: serverMessage }, false));
    await mount();
    await act(async () => { createButton()!.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(tasksPosts()).toHaveLength(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(serverMessage);
    expect(container.textContent).not.toContain("aucune relance automatique");
    expect(localStorage.getItem("vendeo-slideshow-request:p1")).toBeNull();
    expect(createButton()).not.toBeNull();
  });
});
