// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { StudioView } from "@/components/dashboard/sections";
import { SlideshowStudio } from "@/components/studio/SlideshowStudio";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const slides = { duration: 10, aspectRatio: "9:16", transitionSeconds: 0.5, prompt: "Storyboard simulé", countReason: "Exactement cinq visuels fidèles au produit.", warnings: [], campaignGoal: "discover", slides: Array.from({ length: 5 }, (_, index) => ({ index, prompt: `Prompt ${index + 1}`, displaySeconds: 2.4, role: index === 0 ? "hook" : index === 4 ? "cta" : "evidence", headline: `Titre ${index + 1}`, supportingCopy: ["Copie de soutien"], source: { field: "description", excerpt: "fait produit" }, layout: `layout-${index}` })) };
const tracks = ["wonderful", "life-is"].map(id => ({ id: `sb-${id}`, title: id, artist: "Scott Buckley", license: "CC BY 4.0", sourceUrl: "https://www.scottbuckley.com.au/library/", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", credit: "Credit Scott Buckley", youtubeNotice: "YouTube DESCRIPTION" }));
const reply = (data: unknown, ok = true) => ({ ok, json: async () => data });
const setup = () => { const container = document.createElement("div"); document.body.append(container); return { container, root: createRoot(container) }; };
const click = async (container: HTMLElement, name: string) => {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent?.trim() === name);
  expect(button, `button « ${name} »`).toBeTruthy(); await act(async () => button!.click());
};
const selectValue = async (select: HTMLSelectElement, value: string) => act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
const renderStudio = async (root: ReturnType<typeof createRoot>, locale = "fr") => act(async () => root.render(<SlideshowStudio locale={locale} product={{ id: "1", name: "Mon ebook", image: "https://example.com/cover.png" }} />));
describe("Preview slideshow UI", () => {
  it("separates Photo / Diaporama / Video, preserves draft choices across tabs without generation", async () => {
    const fetcher = vi.fn(async (url: string) => reply(url === "/api/studio/slideshow/config" ? { enabled: true, tracks } : url === "/api/studio/prompt" ? { slideshow: slides } : { items: [] }));
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try {
      await act(async () => root.render(<StudioView products={[{ id: "1", name: "Mon ebook" }]} />));
      const tabs = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
      expect(tabs.map(tab => tab.textContent?.trim())).toEqual(["Photo", "Diaporama", "studio.video"]);
      expect(tabs[2].disabled).toBe(true);
      const photoPanel = container.querySelector<HTMLElement>("#studio-photo-panel")!;
      const slideshowPanel = container.querySelector<HTMLElement>("#studio-slideshow-panel")!;
      expect(photoPanel.hidden).toBe(false); expect(slideshowPanel.hidden).toBe(true);
      await click(container, "Diaporama"); expect(photoPanel.hidden).toBe(true); expect(slideshowPanel.hidden).toBe(false);
      expect(slideshowPanel.textContent).not.toMatch(/prompt|personnage|character/i);
      await act(async () => tabs[2].click()); expect(tabs[1].getAttribute("aria-selected")).toBe("true");
      await act(async () => container.querySelectorAll<HTMLButtonElement>(".studio-product-list button")[1].click());
      const music = slideshowPanel.querySelector<HTMLSelectElement>('select[aria-label="Musique"]'); expect(music).toBeTruthy();
      await selectValue(music!, tracks[0].id);
      const goal = [...slideshowPanel.querySelectorAll<HTMLSelectElement>("select")].find(select => select !== music);
      expect(goal).toBeTruthy(); expect(goal!.getAttribute("aria-label")).toBe("Objectif"); await selectValue(goal!, "buy");
      await click(container, "Photo"); await click(container, "Diaporama");
      expect(music!.value).toBe(tracks[0].id); expect(goal!.value).toBe("buy");
      expect(container.textContent).toContain("Créer");
      expect(fetcher.mock.calls.some(([url]) => url === "/api/studio/prompt" || url === "/api/studio/image")).toBe(false);
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });

  it("shows the five-image credit cost before generation and runs preparation, five images and render once", async () => {
    let images = 0;
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      const body = options?.body ? JSON.parse(String(options.body)) : {};
      if (url.endsWith("/config")) return reply({ enabled: true, tracks });
      if (url === "/api/studio/prompt") return reply({ slideshow: slides });
      if (url === "/api/studio/image") { images++; return reply({ generationId: `image-${images}`, imageUrl: `https://example.com/${images}.png`, cost: 20 }); }
      return reply({ generationId: "video-1", videoUrl: "https://example.com/original.mp4", musicId: body.musicId, imageGenerationIds: Array.from({ length: 5 }, (_, i) => `image-${i + 1}`), attribution: "Credit Scott Buckley — YouTube DESCRIPTION", duration: 10 });
    });
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try {
      await renderStudio(root);
      expect(container.textContent).toContain("5 images · 100 crédits Studio");
      expect(container.textContent).toContain("Montage et changement de musique sans crédits d’images supplémentaires.");
      const generate = [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === "Créer")!;
      expect(generate).toBeTruthy(); await act(async () => { generate.click(); generate.click(); });
      expect(images).toBe(5);
      const imageCalls = fetcher.mock.calls.filter(([url]) => url === "/api/studio/image"); expect(imageCalls).toHaveLength(5);
      expect(fetcher.mock.calls.filter(([url]) => url === "/api/studio/prompt")).toHaveLength(1);
      for (const [, options] of imageCalls) { const imageBody = JSON.parse(String(options?.body)); expect(imageBody.slideshow).toMatchObject({ duration: 10, aspectRatio: "9:16", locale: "fr", campaignGoal: "discover", imageCount: 5 }); expect(typeof imageBody.slideshow.slideIndex).toBe("number"); }
      expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/preflight"))).toHaveLength(1);
      expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/render"))).toHaveLength(1);
      expect(container.textContent).toContain("Credit Scott Buckley — YouTube DESCRIPTION");
      expect(container.querySelector('video[aria-label="Diaporama final"]')?.getAttribute("src")).toContain("original");
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });

  it("remplace la musique sans régénérer les images et conserve licence et attribution du résultat", async () => {
    let images = 0;
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      const body = options?.body ? JSON.parse(String(options.body)) : {};
      if (url.endsWith("/config")) return reply({ enabled: true, tracks });
      if (url === "/api/studio/prompt") return reply({ slideshow: slides });
      if (url === "/api/studio/image") { images++; return reply({ generationId: `image-${images}`, imageUrl: `https://example.com/${images}.png`, cost: 20 }); }
      return reply({ generationId: "video-1", videoUrl: `https://example.com/${url.endsWith("/remix") ? "remixed" : "original"}.mp4`, musicId: body.musicId, imageGenerationIds: Array.from({ length: 5 }, (_, i) => `image-${i + 1}`), attribution: "Credit Scott Buckley — YouTube DESCRIPTION", duration: 10 });
    });
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try {
      await renderStudio(root); const music = container.querySelector<HTMLSelectElement>('select[aria-label="Musique"]')!;
      await selectValue(music, tracks[0].id); await click(container, "Créer");
      const license = [...container.querySelectorAll("details")].find(detail => detail.textContent?.includes("Licence et crédits"));
      expect(license).toBeTruthy(); expect(license!.open).toBe(false); expect(license!.querySelector("summary")?.textContent).toContain("Licence et crédits");
      expect(container.textContent).toContain("CC BY 4.0"); expect(license!.textContent).toContain("Credit Scott Buckley");
      await selectValue(music, tracks[1].id); await click(container, "Remplacer la musique");
      expect(images).toBe(5); expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/remix"))).toHaveLength(1);
      expect(container.textContent).toContain("Musique remplacée"); expect(container.textContent).toContain("Credit Scott Buckley — YouTube DESCRIPTION");
      expect(container.querySelector('video[aria-label="Diaporama final"]')?.getAttribute("src")).toContain("remixed");
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });

  it.each([2, 3, 4, 6])("does not generate images for a %i-image storyboard", async count => {
    const invalidPlan = { ...slides, slides: Array.from({ length: count }, (_, index) => ({ index, prompt: `Prompt ${index + 1}`, displaySeconds: 1, role: index === 0 ? "hook" : index === count - 1 ? "cta" : "evidence" })) };
    const fetcher = vi.fn(async (url: string) => url.endsWith("/config") ? reply({ enabled: true, tracks: [] }) : url === "/api/studio/prompt" ? reply({ slideshow: invalidPlan }) : reply({ ready: true }));
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try { await renderStudio(root); await click(container, "Créer"); expect(container.querySelector('[role="alert"]')?.textContent).toContain("exactement 5 images"); expect(fetcher.mock.calls.some(([url]) => url === "/api/studio/image" || String(url).endsWith("/render"))).toBe(false); }
    finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });

  it.each(["preparation", "preflight"]) ("generates no images when %s fails", async failure => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/config")) return reply({ enabled: true, tracks: [] });
      if (url === "/api/studio/prompt") return failure === "preparation" ? reply({ error: "Preparation failed" }, false) : reply({ slideshow: slides });
      if (url.endsWith("/preflight")) return reply({ error: "Preflight failed" }, false);
      return reply({ ready: true });
    });
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try { await renderStudio(root); await click(container, "Créer"); expect(fetcher.mock.calls.filter(([url]) => url === "/api/studio/image")).toHaveLength(0); expect(fetcher.mock.calls.some(([url]) => url.endsWith("/render"))).toBe(false); expect(container.querySelector('[role="alert"]')?.textContent).toContain(failure === "preparation" ? "Preparation failed" : "Preflight failed"); }
    finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });

  it("stops after the first failed image without retrying or assembling", async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith("/config") ? reply({ enabled: true, tracks: [] }) : url === "/api/studio/prompt" ? reply({ slideshow: slides }) : url.endsWith("/preflight") ? reply({ ready: true }) : reply({ error: "Simulation échec" }, false));
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try {
      await renderStudio(root); await click(container, "Créer");
      expect(fetcher.mock.calls.filter(([url]) => url === "/api/studio/image")).toHaveLength(1);
      expect(fetcher.mock.calls.some(([url]) => url.endsWith("/render"))).toBe(false);
      expect(container.textContent).toContain("Aucune nouvelle tentative automatique");
      expect([...container.querySelectorAll("button")].some(button => button.textContent === "Créer")).toBe(false);
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });

  it("advances real milestones, keeps thumbnails on one row and never exposes prompts", async () => {
    const imageWaiters: Array<(value: ReturnType<typeof reply>) => void> = [];
    let finishRender!: (value: ReturnType<typeof reply>) => void;
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/config")) return reply({ enabled: true, tracks: [] });
      if (url === "/api/studio/prompt") return reply({ slideshow: slides });
      if (url.endsWith("/preflight")) return reply({ ready: true });
      if (url === "/api/studio/image") return new Promise<ReturnType<typeof reply>>(resolve => imageWaiters.push(resolve));
      return new Promise<ReturnType<typeof reply>>(resolve => { finishRender = resolve; });
    });
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    const percent = () => Number(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow"));
    try {
      await renderStudio(root); expect(container.querySelector("pre")).toBeNull();
      expect([...container.querySelectorAll("button")].map(button => button.textContent)).toEqual(["Créer"]);
      await click(container, "Créer"); expect(percent()).toBe(15);
      for (let index = 0; index < 5; index++) {
        await act(async () => imageWaiters[index](reply({ generationId: `image-${index}`, imageUrl: `https://example.com/${index}.png`, cost: 20 })));
        expect(percent()).toBe(15 + (index + 1) * 15);
        expect(container.textContent).toContain(`${percent()}%`);
        expect(container.querySelector("pre")).toBeNull(); expect(container.textContent).not.toContain("Prompt 1");
      }
      expect(percent()).toBe(90); expect(container.textContent).toContain("Montage du diaporama");
      const row = container.querySelector<HTMLElement>('[aria-label="Visuels générés"]')!;
      expect(row.style.flexWrap).toBe("nowrap"); expect(row.style.overflowX).toBe("auto");
      expect(row.querySelectorAll("img")).toHaveLength(5);
      for (const image of row.querySelectorAll("img")) expect(image.style.width).toBe("56px");
      expect(container.querySelector('video[aria-label="Diaporama final"]')).toBeNull();
      await act(async () => finishRender(reply({ generationId: "video-ready", videoUrl: "https://example.com/final.mp4", musicId: "", attribution: "", imageGenerationIds: [], duration: 10 })));
      expect(percent()).toBe(100); expect(container.textContent).toContain("100%");
      expect(container.querySelector('video[aria-label="Diaporama final"]')?.getAttribute("src")).toContain("final.mp4");
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });

  it("does not claim 100 percent when the final MP4 is missing", async () => {
    let imageCount = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/config")) return reply({ enabled: true, tracks: [] });
      if (url === "/api/studio/prompt") return reply({ slideshow: slides });
      if (url === "/api/studio/image") return reply({ generationId: `image-${++imageCount}`, imageUrl: "https://example.com/image.png", cost: 20 });
      return reply({ ready: true });
    });
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try {
      await renderStudio(root); await click(container, "Créer");
      expect(container.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("90");
      expect(container.querySelector('[role="alert"]')?.textContent).toContain("Vidéo finale manquante");
      expect(fetcher.mock.calls.filter(([url]) => url === "/api/studio/image")).toHaveLength(5);
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });

  it("uses English labels and copy for the single-button flow", async () => {
    let imageCount = 0;
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/config")) return reply({ enabled: true, tracks });
      if (url === "/api/studio/prompt") return reply({ slideshow: slides });
      if (url === "/api/studio/image") { imageCount++; return reply({ generationId: `image-${imageCount}`, imageUrl: `https://example.com/${imageCount}.png`, cost: 20 }); }
      if (url.endsWith("/render")) return reply({ generationId: "video-en", videoUrl: "https://example.com/video.mp4", musicId: "", imageGenerationIds: Array.from({ length: 5 }, (_, index) => `image-${index + 1}`), attribution: "", duration: 10 });
      return reply({ ready: true });
    });
    vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
    try {
      await renderStudio(root, "en"); expect(container.textContent).toContain("Create"); expect(container.textContent).toContain("5 images · 100 Studio credits");
      expect(container.querySelector('select[aria-label="Music"]')).toBeTruthy();
      await click(container, "Create");
      expect(fetcher.mock.calls.filter(([url]) => url === "/api/studio/prompt")).toHaveLength(1);
      expect(fetcher.mock.calls.filter(([url]) => url === "/api/studio/image")).toHaveLength(5);
      expect(container.textContent).toContain("Your slideshow is ready");
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });
});
