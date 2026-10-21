// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlideshowStudio } from "@/components/studio/SlideshowStudio";

const product = { id: "p1", name: "Produit test", description: "Description existante" };
const images = Array.from({ length: 5 }, (_, i) => ({ id: `image-${i}`, url: `https://placeholder.invalid/image-${i}` }));
const result = { generationId: "video-1", videoUrl: "https://placeholder.invalid/video.mp4", attribution: "Crédits", duration: 25, musicId: "", imageGenerationIds: images.map((image) => image.id) };
const processing = { id: "task-1", kind: "slideshow", status: "processing", progress: 60, message: "Génération en cours…", images };
const completed = { ...processing, status: "completed", progress: 100, message: "Diaporama prêt.", result };
const response = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
const config = () => response({ enabled: true, tracks: [] });

let container: HTMLDivElement;
let root: Root;
let fetcher: ReturnType<typeof vi.fn>;
const mount = async (callback?: () => void) => act(async () => root.render(<SlideshowStudio locale="fr" product={product} onComplete={callback} />));
const remount = async (callback?: () => void) => { root = createRoot(container); await mount(callback); };
const calls = (method: string) => fetcher.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === method);

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  fetcher = vi.fn(async (url: string) => url.endsWith("/config") ? config() : response({ tasks: [] }));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("récupération des tâches serveur SlideshowStudio", () => {
  it("conserve la tâche processing et ses images au remount, puis récupère completed par polling sans POST", async () => {
    vi.useFakeTimers();
    let serverTask: typeof processing | typeof completed = processing;
    fetcher.mockImplementation(async (url: string) => url.endsWith("/config") ? config() : response({ tasks: [serverTask] }));
    await mount();
    expect(container.querySelectorAll("img")).toHaveLength(5);
    expect(container.textContent).toContain("100 crédits Studio utilisés");
    act(() => root.unmount());
    await remount();
    expect(container.querySelectorAll("img")).toHaveLength(5);
    expect(container.textContent).toContain("Génération en cours");
    serverTask = completed;
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(container.textContent).toContain("Ton diaporama est prêt");
    expect(container.querySelector('video[aria-label="Diaporama final"]')?.getAttribute("src")).toBe(result.videoUrl);
    expect(container.querySelectorAll("img")).toHaveLength(5);
    expect(calls("POST")).toHaveLength(0);
  });

  it("ne relance pas après un POST accepté et récupère completed après unmount/remount", async () => {
    vi.useFakeTimers();
    let serverTask: typeof processing | typeof completed | null = null;
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (init?.method === "POST") { serverTask = processing; return response({ task: processing }); }
      return response({ tasks: serverTask ? [serverTask] : [] });
    });
    await mount();
    await act(async () => { container.querySelector<HTMLButtonElement>("button.studio-generate")!.click(); });
    expect(calls("POST")).toHaveLength(1);
    act(() => root.unmount());
    serverTask = completed;
    await remount();
    expect(container.textContent).toContain("Ton diaporama est prêt");
    expect(container.querySelectorAll("img")).toHaveLength(5);
    expect(calls("POST")).toHaveLength(1);
  });

  it("après échec du GET initial, bloque la génération jusqu'au polling récupérateur", async () => {
    vi.useFakeTimers();
    let firstGet = true;
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("/config")) return config();
      if (firstGet) { firstGet = false; throw new Error("réseau indisponible"); }
      return response({ tasks: [completed] });
    });
    await mount();
    const create = container.querySelector<HTMLButtonElement>("button.studio-generate")!;
    expect(create.disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Vérification du suivi");
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(container.textContent).toContain("Ton diaporama est prêt");
    expect(container.querySelector<HTMLButtonElement>("button.studio-generate")!.disabled).toBe(false);
    expect(calls("POST")).toHaveLength(0);
  });

  it("ne retente pas automatiquement un POST à réponse perdue et retrouve la tâche par GET", async () => {
    vi.useFakeTimers();
    let serverTask: typeof processing | typeof completed | null = null;
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (init?.method === "POST") { serverTask = processing; throw new Error("réponse perdue"); }
      return response({ tasks: serverTask ? [serverTask] : [] });
    });
    await mount();
    await act(async () => { container.querySelector<HTMLButtonElement>("button.studio-generate")!.click(); });
    expect(calls("POST")).toHaveLength(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("aucune relance automatique");
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(container.textContent).toContain("Génération en cours");
    expect(container.querySelectorAll("img")).toHaveLength(5);
    expect(calls("POST")).toHaveLength(1);
  });

  it("notifie avec le dernier onComplete après rerender avant la fin du polling", async () => {
    vi.useFakeTimers();
    let serverTask: typeof processing | typeof completed = processing;
    fetcher.mockImplementation(async (url: string) => url.endsWith("/config") ? config() : response({ tasks: [serverTask] }));
    const oldHandler = vi.fn();
    const latestHandler = vi.fn();
    await mount(oldHandler);
    await act(async () => root.render(<SlideshowStudio locale="fr" product={product} onComplete={latestHandler} />));
    serverTask = completed;
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(latestHandler).toHaveBeenCalledTimes(1);
    expect(oldHandler).not.toHaveBeenCalled();
  });

  it("récupère les détails via prompt seul, puis n'envoie tasks qu'après Créer", async () => {
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (url === "/api/studio/prompt") {
        const body = JSON.parse(String(init?.body));
        return body.product.description === "Description existante\nDétails ajoutés"
          ? response({ plan: {} })
          : response({ code: "INSUFFICIENT_PRODUCT_DETAILS", message: "Ajoute une précision produit.", details: "Diagnostics techniques longs" }, false);
      }
      if (url === "/api/studio/tasks" && init?.method === "POST") return response({ task: processing });
      return response({ tasks: [] });
    });
    await mount();
    const click = async (name: string) => act(async () => {
      const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === name)!;
      button.click(); await Promise.resolve();
    });
    await click("Préparer le plan");
    expect(container.textContent).toContain("Ajoute une précision utile");
    expect(container.querySelector("details")?.open).toBe(false);
    const textarea = container.querySelector("textarea")!;
    expect((textarea as HTMLTextAreaElement).value).toBe("Description existante");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, "Détails ajoutés");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Relancer");
    expect(container.textContent).toContain("100 crédits Studio");
    expect(fetcher.mock.calls.filter(([url, init]) => url === "/api/studio/tasks" && (init as RequestInit | undefined)?.method === "POST")).toHaveLength(0);
    const prompt = fetcher.mock.calls.filter(([url]) => url === "/api/studio/prompt").at(-1)!;
    expect(JSON.parse(String(prompt[1]?.body))).toMatchObject({
      product: { description: "Description existante\nDétails ajoutés" }, mediaType: "video", videoMode: "slideshow", duration: 25,
      aspectRatio: "9:16", campaignGoal: "discover", locale: "fr", musicId: "",
    });
    await act(async () => {
      const create = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === "Créer")!;
      create.click(); create.click(); await Promise.resolve();
    });
    expect(fetcher.mock.calls.filter(([url, init]) => url === "/api/studio/tasks" && (init as RequestInit | undefined)?.method === "POST")).toHaveLength(1);
  });
  it("affiche un seul bloc bref pour un ancien échec et garde le blocage après doublons", async () => {
    const long = "Informations produit vérifiées insuffisantes pour cinq images cohérentes. Ajoute trois contenus différents.";
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("/config")) return config();
      if (url === "/api/studio/prompt") return response({ code: "INSUFFICIENT_PRODUCT_DETAILS", error: "Complète la description ci-dessous, puis appuie sur Relancer.", details: long }, false);
      return response({ tasks: [{ id: "failed", kind: "slideshow", status: "failed", message: long, error: long }] });
    });
    await mount();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelectorAll("details")).toHaveLength(1);
    expect(container.querySelector("details")!.open).toBe(false);
    expect(container.textContent?.split(long)).toHaveLength(2);
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, "Même fait. Même fait.");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { [...container.querySelectorAll("button")].find(b => b.textContent === "Relancer")!.click(); });
    expect(container.querySelector("textarea")!.value).toBe("Même fait. Même fait.");
    expect([...container.querySelectorAll("button")].some(b => b.textContent === "Créer")).toBe(false);
    expect([...container.querySelectorAll("button")].find(b => b.textContent === "Relancer")!.disabled).toBe(false);
    expect(fetcher.mock.calls.filter(([url, init]) => url === "/api/studio/tasks" && (init as RequestInit | undefined)?.method === "POST")).toHaveLength(0);
  });
});
