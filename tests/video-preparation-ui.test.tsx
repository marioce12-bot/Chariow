// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { StudioView } from "@/components/dashboard/sections";
import { SlideshowStudio } from "@/components/studio/SlideshowStudio";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const slides = { duration: 10, aspectRatio: "9:16", transitionSeconds: 0.5, prompt: "Storyboard simulé", countReason: "Exactement cinq visuels fidèles au produit.", warnings: [], campaignGoal: "discover", slides: Array.from({length:5}, (_,index) => ({ index, prompt: `Prompt ${index+1}`, displaySeconds: 2.4, role: index === 0 ? "hook" : index === 4 ? "cta" : "evidence", headline: `Titre ${index+1}`, supportingCopy: ["Copie de soutien"], source: {field:"description", excerpt:"fait produit"}, layout: `layout-${index}` })) };
const tracks = ["wonderful", "life-is"].map(id => ({ id: `sb-${id}`, title: id, artist: "Scott Buckley", license: "CC BY 4.0", sourceUrl: "https://www.scottbuckley.com.au/library/", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", credit: "Credit Scott Buckley", youtubeNotice: "YouTube DESCRIPTION" }));
const reply = (data: unknown, ok = true) => ({ ok, json: async () => data });
const setup = () => { const container = document.createElement("div"); document.body.append(container); return { container, root: createRoot(container) }; };
const click = async (container: HTMLElement, name: string) => {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent?.trim() === name);
  expect(button).toBeTruthy(); await act(async () => button!.click());
};
describe("Preview slideshow UI", () => {
  it("separates Photo / Diaporama / Video, keeps video locked and preserves slideshow drafts without generation", async () => {
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => reply(url === "/api/studio/slideshow/config" ? { enabled: true, tracks } : url === "/api/studio/prompt" ? { slideshow: slides } : url === "/api/studio/credits" ? { balance: 0 } : { items: [] }));
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try {
      await act(async () => root.render(<StudioView products={[{ id: "1", name: "Mon ebook" }]} />));
      const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      expect(tabs.map(tab => tab.textContent?.trim())).toEqual(["Photo", "Diaporama", "studio.video"]);
      const video = tabs[2];
      expect(video.disabled).toBe(true);
      const photoPanel = container.querySelector<HTMLElement>("#studio-photo-panel")!;
      const slideshowPanel = container.querySelector<HTMLElement>("#studio-slideshow-panel")!;
      expect(photoPanel.hidden).toBe(false); expect(slideshowPanel.hidden).toBe(true);
      expect(photoPanel.querySelector('[aria-label="Diaporama animé"]')).toBeNull();
      await click(container, "Diaporama");
      expect(tabs[1].getAttribute("aria-selected")).toBe("true");
      expect(photoPanel.hidden).toBe(true); expect(slideshowPanel.hidden).toBe(false);
      expect(slideshowPanel.textContent).not.toMatch(/personnage|character|preview/i);
      await act(async () => video.click());
      expect(tabs[1].getAttribute("aria-selected")).toBe("true");
      await act(async () => container.querySelectorAll<HTMLButtonElement>(".studio-product-list button")[1].click());
      await click(container, "1. Générer les prompts du diaporama"); expect(container.textContent).toContain("Storyboard prêt"); expect(container.textContent).toContain("exactement 5 images"); expect(container.textContent).toContain("Exactement cinq visuels fidèles au produit."); expect(container.textContent).toContain("fait produit"); const promptCall = fetcher.mock.calls.find(([url]) => url === "/api/studio/prompt")!; expect(JSON.parse(String(promptCall[1]?.body)).campaignGoal).toBe("discover");
      const music = slideshowPanel.querySelector<HTMLSelectElement>("fieldset select")!;
      await act(async () => { music.value = tracks[0].id; music.dispatchEvent(new Event("change", { bubbles: true })); });
      await click(container, "Photo");
      expect(photoPanel.hidden).toBe(false); expect(slideshowPanel.hidden).toBe(true);
      await click(container, "Diaporama");
      expect(slideshowPanel.hidden).toBe(false); expect(slideshowPanel.textContent).toContain("Storyboard prêt");
      expect(music.value).toBe(tracks[0].id);
      expect(fetcher.mock.calls.filter(([url]) => url === "/api/studio/prompt")).toHaveLength(1);
      expect(fetcher.mock.calls.some(([url]) => url === "/api/studio/video" || url === "/api/studio/image")).toBe(false);
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });
  it("uses exactly five image calls once, assembles and replaces music without regenerating images", async () => {
    let images = 0;
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      const body = options?.body ? JSON.parse(String(options.body)) : {};
      if (url.endsWith("/config")) return reply({ enabled: true, tracks });
      if (url === "/api/studio/prompt") return reply({ slideshow: slides });
      if (url === "/api/studio/image") { images++; return reply({ generationId: `image-${images}`, imageUrl: `https://example.com/${images}.png`, cost: 20 }); }
      return reply({ generationId: "video-1", videoUrl: `https://example.com/${url.endsWith("/remix") ? "remixed" : "original"}.mp4`, musicId: body.musicId, imageGenerationIds: Array.from({length:5}, (_,i) => `image-${i+1}`), attribution: "Credit Scott Buckley — YouTube DESCRIPTION", duration: 10 });
    });
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try {
      await act(async () => root.render(<SlideshowStudio locale="fr" product={{ id: "1", name: "Mon ebook", image: "https://example.com/cover.png" }} />));
      await click(container, "1. Générer les prompts du diaporama");
      const select = container.querySelector<HTMLSelectElement>("fieldset select")!;
      await act(async () => { select.value = tracks[0].id; select.dispatchEvent(new Event("change", { bubbles: true })); });
      await click(container, "3. Générer le diaporama (5 images)");
      expect(images).toBe(5); expect(container.textContent).toContain("100 crédits Studio"); const imageCalls = fetcher.mock.calls.filter(([url]) => url === "/api/studio/image"); expect(imageCalls).toHaveLength(5); for (const [url, options] of imageCalls) { const imageBody = JSON.parse(String(options?.body)); expect(imageBody.slideshow).toMatchObject({ duration: 10, aspectRatio: "9:16", locale: "fr", campaignGoal: "discover", imageCount: 5 }); expect(typeof imageBody.slideshow.slideIndex).toBe("number"); expect(imageBody.slideshow.product).toMatchObject({ id: "1", name: "Mon ebook", description: "" }); }
      expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/render"))).toHaveLength(1);
      await act(async () => { select.value = tracks[1].id; select.dispatchEvent(new Event("change", { bubbles: true })); });
      await click(container, "Remplacer la musique — garder les images");
      expect(images).toBe(5); expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/remix"))).toHaveLength(1);
      expect(container.textContent).toContain("Musique remplacée"); expect(container.querySelector('video[aria-label="Diaporama final"]')?.getAttribute("src")).toContain("remixed");
      expect(fetcher.mock.calls.some(([url]) => url === "/api/studio/video")).toBe(false);
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });
  it.each([2,3,4,6])("rejects a %i-image storyboard before any image generation", async (count) => {
    const invalidPlan = { ...slides, slides: Array.from({ length: count }, (_, index) => ({ index, prompt: `Prompt ${index + 1}`, displaySeconds: 1 })) };
    const fetcher = vi.fn(async (url: string) => url.endsWith("/config") ? reply({ enabled: true, tracks: [] }) : url === "/api/studio/prompt" ? reply({ slideshow: invalidPlan }) : reply({ ready: true }));
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try {
      await act(async () => root.render(<SlideshowStudio locale="fr" product={{ id: "1", name: "Mon ebook" }} />));
      await click(container, "1. Générer les prompts du diaporama");
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("exactement 5 images");
      expect(fetcher.mock.calls.some(([url]) => url === "/api/studio/image" || String(url).endsWith("/render"))).toBe(false);
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });
  it("stops after the first failed image request without retrying or assembling", async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith("/config") ? reply({ enabled: true, tracks: [] }) : url === "/api/studio/prompt" ? reply({ slideshow: slides }) : url.endsWith("/preflight") ? reply({ ready: true }) : reply({ error: "Simulation échec" }, false));
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try {
      await act(async () => root.render(<SlideshowStudio locale="fr" product={{ id: "1", name: "Mon ebook" }} />));
      await click(container, "1. Générer les prompts du diaporama"); await click(container, "3. Générer le diaporama (5 images)");
      expect(fetcher.mock.calls.filter(([url]) => url === "/api/studio/image")).toHaveLength(1);
      expect(fetcher.mock.calls.some(([url]) => url.endsWith("/render"))).toBe(false); expect(container.textContent).toContain("Aucune nouvelle tentative automatique");
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });
});
