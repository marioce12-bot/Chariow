// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n/i18n";
import { SlideshowStudio } from "@/components/studio/SlideshowStudio";

const product = { id: "p1", name: "Produit test", description: "Description existante" };
const images = Array.from({ length: 5 }, (_, i) => ({ id: `image-${i}`, url: `https://placeholder.invalid/image-${i}` }));
const result = { generationId: "video-1", videoUrl: "https://placeholder.invalid/video.mp4", attribution: "Crédits", duration: 25, musicId: "", imageGenerationIds: images.map((image) => image.id) };
const processing = { id: "task-1", kind: "slideshow", status: "processing", progress: 60, message: "Génération en cours…", images };
const completed = { ...processing, status: "completed", progress: 100, message: "Diaporama prêt.", result };
const response = (body: unknown, ok = true, status = ok ? 200 : 400) => ({ ok, status, json: async () => body }) as Response;
const config = () => response({ enabled: true, voiceoverEnabled: true, voiceoverTestAllowed: true, tracks: [] });

let container: HTMLDivElement;
let root: Root;
let fetcher: ReturnType<typeof vi.fn>;
const defaultRefresh = async (productId: string) => productId === product.id ? product : null;
const mount = async (callback?: () => void, refreshProduct: (id: string) => Promise<typeof product | null> = defaultRefresh) => act(async () => root.render(<I18nProvider><SlideshowStudio locale="fr" product={product} onComplete={callback} onRefreshProduct={refreshProduct} /></I18nProvider>));
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
    await act(async () => root.render(<I18nProvider><SlideshowStudio locale="fr" product={product} onComplete={latestHandler} /></I18nProvider>));
    serverTask = completed;
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(latestHandler).toHaveBeenCalledTimes(1);
    expect(oldHandler).not.toHaveBeenCalled();
  });

  it("sur un 400 INSUFFICIENT_PRODUCT_DETAILS affiche les chiffres serveur sans champ et libère le marqueur", async () => {
    const details = { code: "INSUFFICIENT_PRODUCT_DETAILS", duration: 25, requiredWords: 58, missingWords: 4, wordCount: 54 };
    const message = "La description de ce produit dans ta boutique est trop courte pour une voix off de 25 secondes. Il faut environ 58 mots décrivant le produit (ce qu'il contient, à quoi il sert, pour qui) ; il en manque environ 4. Complète la description dans ta boutique, puis reviens ici et appuie sur « Réessayer ». Aucune image n'a été générée et aucun crédit n'a été consommé.";
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (url === "/api/studio/prompt") return response({ plan: {} });
      if (url === "/api/studio/tasks" && init?.method === "POST") return response({ ...details, error: message }, false, 400);
      return response({ tasks: [] });
    });
    await mount();
    await act(async () => { container.querySelector<HTMLButtonElement>("button.studio-generate")!.click(); await Promise.resolve(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(message);
    expect(container.querySelector("textarea")).toBeNull();
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Réessayer et créer (100 crédits)")).toBe(true);
    expect(localStorage.getItem("vendeo-slideshow-request:p1")).toBeNull();
    expect(container.textContent).not.toContain("Lancement à vérifier");
  });

  it("Réessayer recharge la description boutique, relance la vérification et permet la création si elle est suffisante", async () => {
    const updated = { ...product, description: "Description détaillée mise à jour dans la boutique pour présenter le produit." };
    const refresh = vi.fn(async (productId: string) => productId === product.id ? updated : null);
    let taskPosts = 0;
    const taskBodies: Array<Record<string, any>> = [];
    const details = { code: "INSUFFICIENT_PRODUCT_DETAILS", duration: 25, requiredWords: 58, missingWords: 4, wordCount: 54 };
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (url === "/api/studio/prompt") return response({ plan: {} });
      if (url === "/api/studio/tasks" && init?.method === "POST") {
        taskBodies.push(JSON.parse(String(init.body)));
        taskPosts++;
        return taskPosts === 1 ? response({ ...details, error: "short" }, false, 400) : response({ task: processing }, true, 202);
      }
      return response({ tasks: [] });
    });
    await mount(undefined, refresh);
    const click = async (name: string) => act(async () => {
      const button = [...container.querySelectorAll("button")].find((item) => name === "Réessayer" ? item.textContent?.trim().startsWith("Réessayer et créer") : item.textContent?.trim() === name)!;
      button.click(); await Promise.resolve();
    });
    await click("Créer");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Complète la description dans ta boutique");
    await click("Réessayer");
    expect(refresh).toHaveBeenCalledWith("p1");
    expect(taskPosts).toBe(2);
    expect(taskBodies[1].input.product.description).toBe(updated.description);
    const promptBodies = fetcher.mock.calls.filter(([url]) => url === "/api/studio/prompt").map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(promptBodies).toHaveLength(2);
    expect(promptBodies[1].product.description).toBe(updated.description);
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.textContent).toContain("Génération en cours");
  });

  it("continue avec le produit courant si aucun callback de refresh n’est fourni", async () => {
    const promptBodies: Array<Record<string, any>> = [];
    let taskPosts = 0;
    const insufficient = { code: "INSUFFICIENT_PRODUCT_DETAILS", duration: 25, requiredWords: 58, missingWords: 4, wordCount: 54, error: "short" };
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (url === "/api/studio/prompt") {
        promptBodies.push(JSON.parse(String(init?.body)));
        return response({ plan: {} });
      }
      if (url === "/api/studio/tasks" && init?.method === "POST") { taskPosts++; return response(insufficient, false, 400); }
      return response({ tasks: [] });
    });
    await act(async () => root.render(<I18nProvider><SlideshowStudio locale="fr" product={product} /></I18nProvider>));
    const click = async (matches: (button: HTMLButtonElement) => boolean) => act(async () => {
      const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(matches)!;
      button.click(); await Promise.resolve();
    });
    await click((button) => button.textContent?.trim() === "Créer");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("La description de ce produit");
    await click((button) => button.textContent?.trim().startsWith("Réessayer et créer") === true);
    expect(taskPosts).toBe(2);
    expect(promptBodies).toHaveLength(2);
    expect(promptBodies[1].product.description).toBe(product.description);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("La description de ce produit");
    expect(container.textContent).not.toContain("Impossible de recharger le produit");
    expect(localStorage.getItem("vendeo-slideshow-request:p1")).toBeNull();
  });

  it("si la description rafraîchie reste courte, affiche les nouveaux chiffres sans créer de tâche", async () => {
    const updated = { ...product, description: "Description boutique complétée mais toujours trop courte." };
    const refresh = vi.fn(async () => updated);
    let taskPosts = 0;
    const first = { code: "INSUFFICIENT_PRODUCT_DETAILS", duration: 25, requiredWords: 58, missingWords: 4, wordCount: 54, error: "short" };
    const second = { code: "INSUFFICIENT_PRODUCT_DETAILS", duration: 25, requiredWords: 58, missingWords: 2, wordCount: 56, error: "shorter" };
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (url === "/api/studio/prompt") return response({ plan: {} });
      if (url === "/api/studio/tasks" && init?.method === "POST") {
        taskPosts++;
        return response(taskPosts === 1 ? first : second, false, 400);
      }
      return response({ tasks: [] });
    });
    await mount(undefined, refresh);
    const click = async (name: string) => act(async () => {
      const button = [...container.querySelectorAll("button")].find((item) => name === "Réessayer" ? item.textContent?.trim().startsWith("Réessayer et créer") : item.textContent?.trim() === name)!;
      button.click(); await Promise.resolve();
    });
    await click("Créer");
    await click("Réessayer");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(taskPosts).toBe(2);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("il en manque environ 2");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Il faut environ 58 mots");
    expect(localStorage.getItem("vendeo-slideshow-request:p1")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Réessayer et créer (100 crédits)")).toBe(true);
  });

  it("conserve le marqueur pour le 409 idempotent TASK_ALREADY_ACCEPTED", async () => {
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (url === "/api/studio/prompt") return response({ plan: {} });
      if (url === "/api/studio/tasks" && init?.method === "POST")
        return response({ code: "TASK_ALREADY_ACCEPTED", error: "Le lancement n’a pas été confirmé." }, false, 409);
      return response({ tasks: [] });
    });
    await mount();
    await act(async () => { container.querySelector<HTMLButtonElement>("button.studio-generate")!.click(); await Promise.resolve(); });
    const marker = localStorage.getItem("vendeo-slideshow-request:p1");
    expect(marker).toMatch(/^[0-9a-f-]{36}$/i);
    expect(container.textContent).toContain("Lancement à vérifier");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Lancement non confirmé");
    expect(fetcher.mock.calls.filter(([url, init]) => url === "/api/studio/tasks" && (init as RequestInit | undefined)?.method === "POST")).toHaveLength(1);
  });

  it("la reprise après vérification d’historique réutilise exactement le même ID", async () => {
    const requestId = "123e4567-e89b-42d3-a456-426614174999";
    localStorage.setItem("vendeo-slideshow-request:p1", requestId);
    const postedBodies: Array<Record<string, any>> = [];
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (url === "/api/studio/prompt") return response({ plan: {} });
      if (url === "/api/studio/tasks" && init?.method === "POST") {
        postedBodies.push(JSON.parse(String(init.body)));
        return response({ task: { ...processing, id: requestId } }, true, 202);
      }
      return response({ tasks: [] });
    });
    await mount();
    expect(container.textContent).toContain("Lancement à vérifier");
    const retry = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "J’ai vérifié l’historique, réessayer") as HTMLButtonElement;
    expect(retry).toBeTruthy();
    expect(container.textContent).toContain("le serveur est idempotent");
    expect(calls("POST")).toHaveLength(0);
    await act(async () => { retry.click(); await Promise.resolve(); });
    expect(postedBodies[0]?.id).toBe(requestId);
    expect(calls("POST")).toHaveLength(2);
  });

  it("suspend le polling onglet masqué puis le borne à 15 vérifications", async () => {
    vi.useFakeTimers();
    const originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    localStorage.setItem("vendeo-slideshow-request:p1", "123e4567-e89b-42d3-a456-426614174998");
    fetcher.mockImplementation(async (url: string) => url.endsWith("/config") ? config() : response({ tasks: [] }));
    const pendingGets = () => fetcher.mock.calls.filter(([url, init]) => url === "/api/studio/tasks" && !(init as RequestInit | undefined)?.method).length;
    try {
      await mount();
      await act(async () => { await vi.advanceTimersByTimeAsync(80_000); });
      expect(pendingGets()).toBe(0);
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      await act(async () => { document.dispatchEvent(new Event("visibilitychange")); await Promise.resolve(); });
      await act(async () => { await vi.advanceTimersByTimeAsync(4_000 * 20); });
      expect(pendingGets()).toBe(15);
      expect(container.textContent).toContain("Lancement à vérifier");
      expect(calls("POST")).toHaveLength(0);
    } finally {
      if (originalVisibility) Object.defineProperty(document, "visibilityState", originalVisibility);
      else delete (document as unknown as { visibilityState?: DocumentVisibilityState }).visibilityState;
    }
  });

  it("tout 4xx JSON définitif retire le marqueur et laisse remonter le message public d’origine", async () => {
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (url === "/api/studio/prompt") return response({ plan: {} });
      if (url === "/api/studio/tasks" && init?.method === "POST") return response({ error: "Paramètres de diaporama invalides." }, false, 422);
      return response({ tasks: [] });
    });
    await mount();
    await act(async () => { container.querySelector<HTMLButtonElement>("button.studio-generate")!.click(); await Promise.resolve(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Paramètres de diaporama invalides.");
    expect(localStorage.getItem("vendeo-slideshow-request:p1")).toBeNull();
    expect(container.textContent).not.toContain("Lancement à vérifier");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Créer")).toBe(true);
  });

  it("un 5xx après le POST reste incertain et conserve l’identifiant", async () => {
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (url === "/api/studio/prompt") return response({ plan: {} });
      if (url === "/api/studio/tasks" && init?.method === "POST") return response({ error: "backend failure" }, false, 500);
      return response({ tasks: [] });
    });
    await mount();
    await act(async () => { container.querySelector<HTMLButtonElement>("button.studio-generate")!.click(); await Promise.resolve(); });
    expect(container.textContent).toContain("Lancement à vérifier");
    expect(localStorage.getItem("vendeo-slideshow-request:p1")).toBeTruthy();
    expect(calls("POST").filter(([url]) => url === "/api/studio/tasks")).toHaveLength(1);
  });

  it("une réponse JSON illisible après le POST reste incertaine même avec un status 400", async () => {
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (url === "/api/studio/prompt") return response({ plan: {} });
      if (url === "/api/studio/tasks" && init?.method === "POST") return ({ ok: false, status: 400, json: async () => { throw new SyntaxError("bad json"); } }) as unknown as Response;
      return response({ tasks: [] });
    });
    await mount();
    await act(async () => { container.querySelector<HTMLButtonElement>("button.studio-generate")!.click(); await Promise.resolve(); });
    expect(container.textContent).toContain("Lancement à vérifier");
    expect(localStorage.getItem("vendeo-slideshow-request:p1")).toBeTruthy();
  });

  it("un changement de produit réévalue son marqueur et libère le bouton Créer", async () => {
    vi.useFakeTimers();
    fetcher.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/config")) return config();
      if (url === "/api/studio/prompt") return response({ plan: {} });
      if (url === "/api/studio/tasks" && init?.method === "POST") throw new Error("network disconnected");
      return response({ tasks: [] });
    });
    await mount();
    await act(async () => { container.querySelector<HTMLButtonElement>("button.studio-generate")!.click(); await Promise.resolve(); });
    expect(container.textContent).toContain("Lancement à vérifier");
    expect(localStorage.getItem("vendeo-slideshow-request:p1")).toBeTruthy();
    const secondProduct = { id: "p2", name: "Autre produit", description: "Autre description complète." };
    await act(async () => root.render(<I18nProvider><SlideshowStudio locale="fr" product={secondProduct} onRefreshProduct={async () => secondProduct} /></I18nProvider>));
    expect(localStorage.getItem("vendeo-slideshow-request:p2")).toBeNull();
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "Créer" && !button.disabled)).toBe(true);
  });

  it("fait progresser l’indicateur sous 100% pendant les étapes images 1 à n", async () => {
    vi.useFakeTimers();
    fetcher.mockImplementation(async (url: string) => url.endsWith("/config") ? config() : response({ tasks: [{ ...processing, progress: 14, phase: "running", images: images.slice(0, 1), message: "Image 1/5" }] }));
    await mount();
    expect(container.textContent).toContain("Image 1/5");
    const before = Number(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") ?? 0);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    const after = Number(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") ?? 0);
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThan(100);
    expect(container.textContent).toContain("1/5");
    expect(container.querySelector(".chat-launch-progress-ring")).not.toBeNull();
    expect(container.querySelector(".chat-launch-progress-value")).not.toBeNull();
    expect(container.querySelector(".chat-launch-progress-copy small")?.textContent).toContain("Progression estimée");
    expect(container.querySelector('[data-testid="slideshow-spinner"]')).toBeNull();
    fetcher.mockImplementation(async (url: string) => url.endsWith("/config") ? config() : response({ tasks: [{ ...processing, progress: 82, phase: "running", images: images.slice(0, 4), message: "Image 4/5" }] }));
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(container.textContent).toContain("4/5 visuels");
    expect(container.textContent).not.toContain("100%");
  });

  it("avance pendant chaque longue étape sans reculer au polling", async () => {
    vi.useFakeTimers();
    let task: any = { ...processing, revision: 1, phase: "running", progress: 5, images: [], message: "Génération du visuel 1/5…" };
    fetcher.mockImplementation(async (url: string) => url.endsWith("/config") ? config() : response({ tasks: [task] }));
    const percent = () => Number(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow") ?? 0);
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
    const message = "Le diaporama n’a pas pu être créé. Consultez l’historique avant de réessayer.";
    fetcher.mockImplementation(async (url: string) => url.endsWith("/config") ? config() : response({ tasks: [{ ...processing, status: "failed", images: images.slice(0, 4), message: "Technical worker trace", error: "Technical worker trace", details: "raw details", creditsConsumed: 80 }] }));
    await mount();
    expect(container.textContent?.split(message)).toHaveLength(2);
    expect(container.textContent).not.toContain("Technical worker trace");
    expect(container.querySelector("pre")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
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
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Le diaporama n’a pas pu être créé. Consultez l’historique avant de réessayer.");
    expect(container.querySelectorAll("details")).toHaveLength(0);
    expect(container.querySelectorAll("pre")).toHaveLength(0);
    expect(container.textContent).not.toContain(long);
    expect([...container.querySelectorAll("button")].some(b => b.textContent === "Créer")).toBe(false);
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
    await act(async () => root.render(<I18nProvider><SlideshowStudio locale="fr" product={{ ...product, id: "p2" }} /></I18nProvider>));
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
    await act(async () => root.render(<I18nProvider><SlideshowStudio locale="fr" product={null} selectedTaskId="selected-old" /></I18nProvider>));
    expect(container.querySelectorAll("img")).toHaveLength(4); expect(container.textContent).toContain("80 crédits Studio utilisés");
    expect(container.textContent).toContain("Produit historique"); expect(container.textContent).toContain("20 crédits Studio");
    const button = container.querySelector<HTMLButtonElement>(".studio-continue")!;
    expect(button.disabled).toBe(true); expect(calls("POST")).toHaveLength(0);
    await act(async () => { container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(); });
    await act(async () => { button.click(); button.click(); });
    expect(calls("POST")).toHaveLength(1); const call = calls("POST")[0];
    expect(call[0]).toBe("/api/studio/tasks/selected-old/continue"); expect(JSON.parse(String(call[1].body))).toEqual({ expectedRevision: 5, confirmCost: 20 });
    expect(container.textContent).toContain("visuel 5/5"); expect(container.querySelectorAll("img")).toHaveLength(4);
    expect(container.querySelector(".chat-launch-progress-ring")).not.toBeNull();
  });
  it("an uncertain stage shows a readable block and never submits any paid request", async () => {
    const old = { ...processing, id: "unknown", status: "failed", revision: 5, images: images.slice(0, 4), creditsConsumed: 80, error: "Suivi interrompu.", resume: { allowed: false, reason: "STAGE_UNCERTAIN", cost: 20, requiresConfirmation: true } };
    fetcher.mockImplementation(async (url: string) => url.endsWith("/config") ? config() : response({ task: old }));
    await act(async () => root.render(<I18nProvider><SlideshowStudio locale="fr" product={null} selectedTaskId="unknown" /></I18nProvider>));
    expect(container.querySelector<HTMLButtonElement>(".studio-continue")?.disabled).toBe(true);
    expect(container.textContent).toContain("éviter une nouvelle facturation"); expect(container.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Le diaporama n’a pas pu être créé. Consultez l’historique avant de réessayer.");
    expect(container.querySelectorAll("details, pre")).toHaveLength(0); expect(calls("POST")).toHaveLength(0);
  });

});
