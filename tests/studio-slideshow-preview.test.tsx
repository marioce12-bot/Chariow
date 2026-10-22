// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n/i18n";
import { SlideshowStudio } from "@/components/studio/SlideshowStudio";

const product = { id: "preview-product", name: "Produit test", description: "Description du produit" };
const images = Array.from({ length: 5 }, (_, index) => ({ id: `image-${index + 1}`, url: `https://placeholder.invalid/image-${index + 1}.jpg` }));
const result = { generationId: "video-1", videoUrl: "https://placeholder.invalid/video.mp4", attribution: "Crédits musicaux", duration: 25, musicId: "", imageGenerationIds: images.map((image) => image.id) };
const processing = { id: "task-preview", kind: "slideshow", status: "processing", progress: 61, message: "Génération en cours…", images };
const completed = { ...processing, status: "completed", progress: 100, message: "Diaporama prêt.", result };
const response = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
const config = () => response({ enabled: true, voiceoverEnabled: true, voiceoverTestAllowed: true });

let container: HTMLDivElement;
let root: Root;
let fetcher: ReturnType<typeof vi.fn>;
const mount = async (locale = "fr") => act(async () => root.render(<I18nProvider><SlideshowStudio locale={locale} product={product} /></I18nProvider>));
const calls = (method: string) => fetcher.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === method);
const preview = () => container.querySelector<HTMLElement>('section[aria-label="Aperçu du diaporama"]');

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container); localStorage.clear();
  fetcher = vi.fn(async (url: string) => {
    if (url.endsWith("/config")) return config();
    if (url === "/api/studio/credits") return response({ balance: 500, reserved: 0 });
    return response({ tasks: [] });
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("SlideshowStudio preview zone", () => {
  it("renders an accessible empty preview and does not create a task on mount", async () => {
    await mount();
    const section = preview();
    expect(section).not.toBeNull();
    expect(section?.classList.contains("studio-slideshow-preview")).toBe(true);
    expect(section?.textContent).toContain("Ton diaporama");
    expect(section?.textContent).toContain("Prêt à créer");
    expect(calls("POST")).toHaveLength(0);
  });

  it("keeps campaign progress, image thumbnails, and the final video inside the preview", async () => {
    vi.useFakeTimers();
    let task: any = processing;
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("/config")) return config();
      if (url === "/api/studio/credits") return response({ balance: 500, reserved: 0 });
      return response({ tasks: [task] });
    });
    await mount();
    let section = preview();
    expect(section).not.toBeNull();
    expect(section?.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(section?.querySelector('[aria-label="Visuels générés"]')).not.toBeNull();
    expect(section?.querySelectorAll("img")).toHaveLength(5);
    expect(container.querySelector('[role="progressbar"]')).toBe(section?.querySelector('[role="progressbar"]'));
    task = completed;
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    section = preview();
    expect(section?.textContent).toContain("Ton diaporama est prêt");
    expect(section?.querySelector('video[aria-label="Diaporama final"]')?.getAttribute("src")).toBe(result.videoUrl);
    const video = section?.querySelector("video");
    expect(video?.parentElement?.classList.contains("studio-slideshow-final")).toBe(true);
    expect(video?.controls).toBe(true);
    expect(video?.playsInline).toBe(true);
    expect(video?.preload).toBe("metadata");
    expect(video?.style.maxWidth).toBe("var(--slideshow-player-width, 420px)");
    expect(video?.style.maxHeight).toBe("var(--slideshow-player-height, 600px)");
    const download = section?.querySelector<HTMLButtonElement>('.studio-slideshow-final button');
    expect(download?.type).toBe("button");
    expect(section?.querySelector('a[href="' + result.videoUrl + '"]')).toBeNull();
    expect(download?.textContent).toBe("Télécharger");
    expect(section?.querySelector("details summary")?.textContent).toContain("Crédits musique à joindre");
    expect(section?.querySelector("details textarea")?.textContent).toBe(result.attribution);
    expect(section?.querySelectorAll("img")).toHaveLength(5);
    expect(calls("POST")).toHaveLength(0);
  });

  it("places task failure in the preview and keeps a paid retry behind explicit confirmation", async () => {
    const failure = "Le suivi serveur n’a pas pu continuer.";
    const failed = {
      ...processing, status: "failed", error: failure, message: failure, images: images.slice(0, 3), revision: 4,
      resume: { allowed: true, reason: null, cost: 20, nextStep: "image", requiresConfirmation: true },
    };
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith("/config")) return config();
      if (url === "/api/studio/credits") return response({ balance: 500, reserved: 0 });
      if (url.endsWith("/continue")) return response({ task: failed });
      return response({ tasks: [failed] });
    });
    await mount();
    const section = preview();
    expect(section).not.toBeNull();
    expect(section?.querySelector('[role="alert"]')?.textContent).toBe("Le diaporama n’a pas pu être créé. Consultez l’historique avant de réessayer.");
    expect(section?.querySelectorAll("details, pre")).toHaveLength(0);
    expect(section?.querySelectorAll("img")).toHaveLength(3);
    expect(container.textContent).toContain("20 crédits Studio");
    const continueButton = container.querySelector<HTMLButtonElement>(".studio-continue");
    expect(continueButton).not.toBeNull();
    expect(continueButton?.disabled).toBe(true);
    expect(calls("POST")).toHaveLength(0);
    await act(async () => { container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click(); });
    expect(continueButton?.disabled).toBe(false);
    expect(calls("POST")).toHaveLength(0);
  });

  it("uses the English preview title", async () => {
    await mount("en");
    const section = container.querySelector('section[aria-label="Slideshow preview"]');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain("Your slideshow");
  });
});
