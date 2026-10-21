// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { StudioView } from "@/components/dashboard/sections";
import { SlideshowStudio } from "@/components/studio/SlideshowStudio";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const slides = { duration: 5, aspectRatio: "9:16", transitionSeconds: 0.5, prompt: "Storyboard simulé", countReason: "Le produit comporte deux bénéfices clés.", warnings: [], campaignGoal: "discover", slides: [{ index: 0, prompt: "Prompt 1", displaySeconds: 2.75, role: "hook", headline: "Un titre", supportingCopy: ["Copie de soutien"], source: { field: "description", excerpt: "fait produit" }, layout: "cover" }, { index: 1, prompt: "Prompt 2", displaySeconds: 2.75, role: "cta", headline: "Passez à l’action", supportingCopy: [], layout: "hero" }] };
const tracks = ["wonderful", "life-is"].map(id => ({ id: `sb-${id}`, title: id, artist: "Scott Buckley", license: "CC BY 4.0", sourceUrl: "https://www.scottbuckley.com.au/library/", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", credit: "Credit Scott Buckley", youtubeNotice: "YouTube DESCRIPTION" }));
const reply = (data: unknown, ok = true) => ({ ok, json: async () => data });
const setup = () => { const container = document.createElement("div"); document.body.append(container); return { container, root: createRoot(container) }; };
const click = async (container: HTMLElement, name: string) => {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent === name);
  expect(button).toBeTruthy(); await act(async () => button!.click());
};
describe("Preview slideshow UI", () => {
  it("keeps the global video tab and character scenes locked, preparing prompts without image calls", async () => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => reply(url === "/api/studio/slideshow/config" ? { enabled: true, tracks } : url === "/api/studio/prompt" ? { slideshow: slides } : url === "/api/studio/credits" ? { balance: 0 } : { items: [] }));
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try {
      await act(async () => root.render(<StudioView products={[{ id: "1", name: "Mon ebook" }]} />));
      const video = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(button => button.textContent?.includes("studio.video"))!;
      expect(video.disabled).toBe(true);
      expect([...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.startsWith("Scènes avec personnages"))?.disabled).toBe(true);
      await act(async () => container.querySelectorAll<HTMLButtonElement>(".studio-product-list button")[1].click());
      await click(container, "1. Générer les prompts du diaporama"); expect(container.textContent).toContain("Storyboard prêt"); expect(container.textContent).toContain("2 à 5 images"); expect(container.textContent).toContain("Le produit comporte deux bénéfices clés."); expect(container.textContent).toContain("fait produit"); const promptCall = fetcher.mock.calls.find(([url]) => url === "/api/studio/prompt")!; expect(JSON.parse(String(promptCall[1]?.body)).campaignGoal).toBe("discover");
      expect(fetcher.mock.calls.some(([url]) => url === "/api/studio/video" || url === "/api/studio/image")).toBe(false);
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });
  it("uses two image calls once, assembles and replaces music without regenerating images", async () => {
    let images = 0;
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      const body = options?.body ? JSON.parse(String(options.body)) : {};
      if (url.endsWith("/config")) return reply({ enabled: true, tracks });
      if (url === "/api/studio/prompt") return reply({ slideshow: slides });
      if (url === "/api/studio/image") { images++; return reply({ generationId: `image-${images}`, imageUrl: `https://example.com/${images}.png`, cost: 20 }); }
      return reply({ generationId: "video-1", videoUrl: `https://example.com/${url.endsWith("/remix") ? "remixed" : "original"}.mp4`, musicId: body.musicId, imageGenerationIds: ["image-1", "image-2"], attribution: "Credit Scott Buckley — YouTube DESCRIPTION", duration: 5 });
    });
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try {
      await act(async () => root.render(<SlideshowStudio locale="fr" product={{ id: "1", name: "Mon ebook", image: "https://example.com/cover.png" }} />));
      await click(container, "1. Générer les prompts du diaporama");
      const select = container.querySelector<HTMLSelectElement>("fieldset select")!;
      await act(async () => { select.value = tracks[0].id; select.dispatchEvent(new Event("change", { bubbles: true })); });
      await click(container, "3. Générer le diaporama (2 images)");
      expect(images).toBe(2); expect(container.textContent).toContain("40 crédits Studio"); const imageCalls = fetcher.mock.calls.filter(([url]) => url === "/api/studio/image"); expect(imageCalls).toHaveLength(2); for (const [url, options] of imageCalls) { const imageBody = JSON.parse(String(options?.body)); expect(imageBody.slideshow).toMatchObject({ duration: 5, aspectRatio: "9:16", locale: "fr", campaignGoal: "discover", imageCount: 2 }); expect(typeof imageBody.slideshow.slideIndex).toBe("number"); expect(imageBody.slideshow.product).toMatchObject({ id: "1", name: "Mon ebook", description: "" }); }
      expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/render"))).toHaveLength(1);
      await act(async () => { select.value = tracks[1].id; select.dispatchEvent(new Event("change", { bubbles: true })); });
      await click(container, "Remplacer la musique — garder les images");
      expect(images).toBe(2); expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/remix"))).toHaveLength(1);
      expect(container.textContent).toContain("Musique remplacée"); expect(container.querySelector('video[aria-label="Diaporama final"]')?.getAttribute("src")).toContain("remixed");
      expect(fetcher.mock.calls.some(([url]) => url === "/api/studio/video")).toBe(false);
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });
  it("rejects a storyboard above five images before any image generation", async () => {
    const invalidPlan = { ...slides, slides: Array.from({ length: 6 }, (_, index) => ({ index, prompt: `Prompt ${index + 1}`, displaySeconds: 1 })) };
    const fetcher = vi.fn(async (url: string) => url.endsWith("/config") ? reply({ enabled: true, tracks: [] }) : url === "/api/studio/prompt" ? reply({ slideshow: invalidPlan }) : reply({ ready: true }));
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try {
      await act(async () => root.render(<SlideshowStudio locale="fr" product={{ id: "1", name: "Mon ebook" }} />));
      await click(container, "1. Générer les prompts du diaporama");
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("entre 2 et 5 images");
      expect(fetcher.mock.calls.some(([url]) => url === "/api/studio/image" || String(url).endsWith("/render"))).toBe(false);
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });
  it("stops after the first failed image request without retrying or assembling", async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith("/config") ? reply({ enabled: true, tracks: [] }) : url === "/api/studio/prompt" ? reply({ slideshow: slides }) : url.endsWith("/preflight") ? reply({ ready: true }) : reply({ error: "Simulation échec" }, false));
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try {
      await act(async () => root.render(<SlideshowStudio locale="fr" product={{ id: "1", name: "Mon ebook" }} />));
      await click(container, "1. Générer les prompts du diaporama"); await click(container, "3. Générer le diaporama (2 images)");
      expect(fetcher.mock.calls.filter(([url]) => url === "/api/studio/image")).toHaveLength(1);
      expect(fetcher.mock.calls.some(([url]) => url.endsWith("/render"))).toBe(false); expect(container.textContent).toContain("Aucune nouvelle tentative automatique");
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });
});
