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
const config = () => response({ enabled: true, voiceoverEnabled: true, voiceoverTestAllowed: true, tracks: [] });

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
  localStorage.clear();
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
    expect(calls("POST")).toHaveLength(2);
    act(() => root.unmount());
    serverTask = completed;
    await remount();
    expect(container.textContent).toContain("Ton diaporama est prêt");
    expect(container.querySelectorAll("img")).toHaveLength(5);
    expect(calls("POST")).toHaveLength(2);
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
    expect(container.querySelector<HTMLButtonElement>("button.studio-generate")).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Vérification du suivi");
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(container.textContent).toContain("Ton diaporama est prêt");
    expect(calls("POST")).toHaveLength(0);
  });

  it("ne retente pas automatiquement un POST à réponse perdue et retrouve la tâche par GET", async () => {
    vi.useFakeTimers();
    let serverTask: typeof processing | typeof completed | null = null;
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (init?.method === "POST" && url === "/api/studio/tasks") { const posted = JSON.parse(String(init.body)); serverTask = { ...processing, id: posted.id }; throw new Error("réponse perdue"); }
      return response({ tasks: serverTask ? [serverTask] : [] });
    });
    await mount();
    await act(async () => { container.querySelector<HTMLButtonElement>("button.studio-generate")!.click(); });
    expect(fetcher.mock.calls.filter(([url, init]) => url === "/api/studio/tasks" && (init as RequestInit | undefined)?.method === "POST")).toHaveLength(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("aucune relance automatique");
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(container.textContent).toContain("Génération en cours");
    expect(container.querySelectorAll("img")).toHaveLength(5);
    expect(calls("POST")).toHaveLength(2);
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
    expect(container.textContent).toContain("Voix et musique ajoutées automatiquement");
    expect(container.querySelector('[aria-label="Musique"]')).toBeNull();
    expect(container.textContent).not.toContain("Remplacer la musique");
    const click = async (name: string) => act(async () => {
      const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === name)!;
      button.click(); await Promise.resolve();
    });
    await click("Créer");
    expect(container.textContent).toContain("Ajoute une précision utile");
    expect(container.querySelector("details")?.open).toBe(false);
    const textarea = container.querySelector("textarea")!;
    expect((textarea as HTMLTextAreaElement).value).toBe("Description existante");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, "Détails ajoutés");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click("Relancer");
    expect(fetcher.mock.calls.filter(([url, init]) => url === "/api/studio/tasks" && (init as RequestInit | undefined)?.method === "POST")).toHaveLength(0);
    expect(container.textContent).toContain("Plan prêt");
    await click("Créer");
    expect(container.textContent).toContain("100 crédits Studio");
    expect(fetcher.mock.calls.filter(([url, init]) => url === "/api/studio/tasks" && (init as RequestInit | undefined)?.method === "POST")).toHaveLength(1);
    const prompt = fetcher.mock.calls.filter(([url]) => url === "/api/studio/prompt").at(-1)!;
    expect(JSON.parse(String(prompt[1]?.body))).toMatchObject({
      product: { description: "Description existante\nDétails ajoutés" }, mediaType: "video", videoMode: "slideshow", duration: 25,
      aspectRatio: "9:16", campaignGoal: "discover", locale: "fr", musicId: "", voiceover: true,
    });
    const launch = fetcher.mock.calls.find(([url, init]) => url === "/api/studio/tasks" && (init as RequestInit | undefined)?.method === "POST")!;
    expect(JSON.parse(String(launch[1]?.body))).toMatchObject({ input: { musicId: "", voiceover: true } });
    expect([...container.querySelectorAll("button")].some((item) => item.textContent?.trim() === "Créer")).toBe(false);
  });
  it("fait progresser l’indicateur sous 100% pendant les étapes images 1 à n", async () => {
    vi.useFakeTimers();
    fetcher.mockImplementation(async (url: string) => url.endsWith("/config") ? config() : response({ tasks: [{ ...processing, progress: 14, phase: "running", images: images.slice(0, 1), message: "Image 1/5" }] }));
    await mount();
    expect(container.textContent).toContain("Image 1/5");
    const before = Number(container.querySelector('[role="status"]')?.textContent?.match(/(\d+(?:\.\d+)?)%/)?.[1] ?? 0);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    const after = Number(container.querySelector('[role="status"]')?.textContent?.match(/(\d+(?:\.\d+)?)%/)?.[1] ?? 0);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThan(100);
    expect(container.textContent).toContain("1/5");
    expect(container.querySelector('[data-testid="slideshow-spinner"]')?.getAttribute("class")).toContain("animate-spin");
    fetcher.mockImplementation(async (url: string) => url.endsWith("/config") ? config() : response({ tasks: [{ ...processing, progress: 82, phase: "running", images: images.slice(0, 4), message: "Image 4/5" }] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(container.textContent).toContain("4/5 visuels");
    expect(container.textContent).not.toContain("100%");
  });

  it("avance pendant chaque longue étape sans reculer au polling", async () => {
    vi.useFakeTimers();
    let task: any = { ...processing, revision: 1, phase: "running", progress: 5, images: [], message: "Génération du visuel 1/5…" };
    fetcher.mockImplementation(async (url: string) => url.endsWith("/config") ? config() : response({ tasks: [task] }));
    const percent = () => Number(container.querySelector('[role="status"]')?.textContent?.match(/(\d+(?:\.\d+)?)%/)?.[1] ?? 0);
    await mount(); const start = percent();
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); }); const first = percent();
    expect(first).toBeGreaterThan(start); expect(first).toBeLessThan(22);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); }); expect(percent()).toBeGreaterThanOrEqual(first);
    task = { ...task, revision: 2, progress: 22, images: images.slice(0, 1), message: "Génération du visuel 2/5…" };
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); }); const next = percent();
    expect(next).toBeGreaterThanOrEqual(first);
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(percent()).toBeGreaterThan(next); expect(percent()).toBeLessThan(39);
    expect(container.textContent).toContain("visuel 2/5"); expect(calls("POST")).toHaveLength(0);
  });
  it("affiche l'erreur de worker une seule fois et conserve les quatre images", async () => {
    const message = "Le suivi serveur n’a pas pu continuer.";
    fetcher.mockImplementation(async (url: string) => url.endsWith("/config") ? config() : response({ tasks: [{ ...processing, status: "failed", images: images.slice(0, 4), message, error: message, creditsConsumed: 80 }] }));
    await mount();
    expect(container.textContent?.split(message)).toHaveLength(2);
    expect(container.querySelectorAll("img")).toHaveLength(4);
    expect(container.textContent).toContain("80 crédits Studio utilisés");
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(calls("POST")).toHaveLength(0);
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
  it("a new product clears the old failed workspace so Create starts exactly one new task", async () => {
    const old = { ...processing, status: "failed", revision: 5, images: images.slice(0, 4), error: "dispatch", resume: { allowed: true, cost: 20, requiresConfirmation: true } };
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (init?.method === "POST" && url === "/api/studio/prompt") return response({ plan: {} });
      if (init?.method === "POST" && url === "/api/studio/tasks") return response({ task: { ...processing, id: JSON.parse(String(init.body)).id } });
      return response({ tasks: [old] });
    });
    await mount(); expect(container.querySelector(".studio-continue")).not.toBeNull();
    await act(async () => root.render(<SlideshowStudio locale="fr" product={{ ...product, id: "p2" }} />));
    const create = container.querySelector<HTMLButtonElement>("button.studio-generate")!;
    expect(create.disabled).toBe(false); expect(container.textContent).toContain("Coût : 100 crédits Studio");
    await act(async () => { create.click(); create.click(); });
    expect(fetcher.mock.calls.filter(([url, init]) => url === "/api/studio/tasks" && init?.method === "POST")).toHaveLength(1);
  });
  it("history ID loads its four images and Continue requires cost confirmation, then sends one POST", async () => {
    const old = { ...processing, id: "selected-old", status: "failed", revision: 5, images: images.slice(0, 4), creditsConsumed: 80, progress: 73, error: "Suivi interrompu.", input: { product: { name: "Produit historique" }, duration: 30, musicId: "" }, resume: { allowed: true, cost: 20, requiresConfirmation: true, nextStep: "image" } };
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (url.endsWith("/continue")) return response({ task: init?.method === "POST" ? { ...old, status: "processing", message: "Génération du visuel 5/5…" } : old });
      return response({ tasks: [{ ...completed, id: "unrelated-latest" }] });
    });
    await act(async () => root.render(<SlideshowStudio locale="fr" product={null} selectedTaskId="selected-old" />));
    expect(container.querySelectorAll("img")).toHaveLength(4); expect(container.textContent).toContain("80 crédits Studio utilisés");
    expect(container.textContent).toContain("Produit historique"); expect(container.textContent).toContain("20 crédits Studio");
    const button = container.querySelector<HTMLButtonElement>(".studio-continue")!;
    expect(button.disabled).toBe(true); expect(calls("POST")).toHaveLength(0);
    await act(async () => { container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    await act(async () => { button.click(); button.click(); });
    expect(calls("POST")).toHaveLength(1); const call = calls("POST")[0];
    expect(call[0]).toBe("/api/studio/tasks/selected-old/continue"); expect(JSON.parse(String(call[1].body))).toEqual({ expectedRevision: 5, confirmCost: 20 });
    expect(container.textContent).toContain("visuel 5/5"); expect(container.querySelectorAll("img")).toHaveLength(4);
    expect(container.querySelector('[data-testid="slideshow-spinner"]')).not.toBeNull();
  });
  it("an uncertain stage shows a readable block and never submits any paid request", async () => {
    const old = { ...processing, id: "unknown", status: "failed", revision: 5, images: images.slice(0, 4), creditsConsumed: 80, error: "Suivi interrompu.", resume: { allowed: false, reason: "STAGE_UNCERTAIN", cost: 20, requiresConfirmation: true } };
    fetcher.mockImplementation(async (url: string) => url.endsWith("/config") ? config() : response({ task: old }));
    await act(async () => root.render(<SlideshowStudio locale="fr" product={null} selectedTaskId="unknown" />));
    expect(container.querySelector<HTMLButtonElement>(".studio-continue")?.disabled).toBe(true);
    expect(container.textContent).toContain("éviter une nouvelle facturation"); expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(container.textContent?.split("Suivi interrompu.")).toHaveLength(2); expect(calls("POST")).toHaveLength(0);
  });

});
