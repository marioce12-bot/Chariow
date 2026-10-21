// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SlideshowStudio } from "@/components/studio/SlideshowStudio";

const product = { id: "p1", name: "Produit test" };
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
});
