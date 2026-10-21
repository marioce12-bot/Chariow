// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SlideshowStudio } from "@/components/studio/SlideshowStudio";
import { verifySlideImage } from "@/components/studio/SlideshowStudio";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const tracks = [{ id: "sb-wonderful", title: "wonderful", artist: "Scott Buckley", license: "CC BY 4.0", sourceUrl: "https://example.com/source", licenseUrl: "https://example.com/license", credit: "Credit Scott Buckley", youtubeNotice: "YouTube DESCRIPTION" }];
const reply = (data: unknown, ok = true) => ({ ok, json: async () => data });
const setup = () => { const container = document.createElement("div"); document.body.append(container); return { container, root: createRoot(container) }; };
const render = async (root: ReturnType<typeof createRoot>) => act(async () => root.render(<SlideshowStudio locale="fr" product={{ id: "p1", name: "Mon ebook", image: "https://example.com/cover.png" }} />));
const click = async (container: HTMLElement, name: string) => { const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(el => el.textContent?.trim() === name); expect(button).toBeTruthy(); await act(async () => button!.click()); };
const completed = { id: "task-1", kind: "slideshow", status: "completed", progress: 100, message: "Diaporama prêt.", images: Array.from({ length: 5 }, (_, i) => ({ id: `i${i}`, url: `https://example.com/${i}.png` })), result: { generationId: "video-1", videoUrl: "https://example.com/video.mp4", attribution: "Credit Scott Buckley — YouTube DESCRIPTION", duration: 25, musicId: "", imageGenerationIds: ["i0", "i1", "i2", "i3", "i4"] } };
describe("Slideshow server task UI", () => {
 beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/config") ? reply({ enabled: true, tracks }) : url === "/api/studio/tasks" ? reply({ tasks: [] }) : reply({}))); });
 it("uses one task POST for double taps, never calls client pipeline and preserves music remix", async () => {
   const fetcher = vi.fn(async (url: string, options?: RequestInit) => { if (url.endsWith("/config")) return reply({ enabled: true, tracks }); if (url === "/api/studio/tasks" && options?.method === "POST") return reply({ task: completed }); if (url === "/api/studio/tasks") return reply({ tasks: [] }); if (url.endsWith("/remix")) return reply({ ...completed.result, videoUrl: "https://example.com/remix.mp4", musicId: "sb-wonderful" }); return reply({}); });
   vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
   try { await render(root); expect(container.textContent).toContain("Coût : 100 crédits Studio"); const create = [...container.querySelectorAll("button")].find(b => b.textContent?.trim() === "Créer")!; await act(async () => { create.click(); create.click(); });
    expect(fetcher.mock.calls.filter(([url, options]) => url === "/api/studio/tasks" && options?.method === "POST")).toHaveLength(1); expect(fetcher.mock.calls.filter(([url, options]) => url === "/api/studio/prompt" && options?.method === "POST")).toHaveLength(1); expect(fetcher.mock.calls.some(([url]) => ["/api/studio/image", "/api/studio/slideshow/preflight", "/api/studio/slideshow/render"].includes(String(url)))).toBe(false); expect(container.querySelectorAll("img")).toHaveLength(5); expect(container.querySelector('video[aria-label="Diaporama final"]')?.getAttribute("src")).toContain("video.mp4");
    const music = container.querySelector<HTMLSelectElement>('select[aria-label="Musique"]')!; await act(async () => { music.value = tracks[0].id; music.dispatchEvent(new Event("change", { bubbles: true })); }); await click(container, "Remplacer la musique"); expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/remix"))).toHaveLength(1); expect(container.textContent).toContain("YouTube DESCRIPTION");
   } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
 });
 it("recovers completed task on mount and carries images/result without POST", async () => {
   const fetcher = vi.fn(async (url: string, opts?: RequestInit) => url.endsWith("/config") ? reply({ enabled: true, tracks }) : reply({ tasks: [completed] })); vi.stubGlobal("fetch", fetcher); const { container, root } = setup();
   try { await render(root); expect(container.textContent).toContain("Ton diaporama est prêt"); expect(container.querySelectorAll("img")).toHaveLength(5); expect(container.querySelector('video[aria-label="Diaporama final"]')?.getAttribute("src")).toContain("video.mp4"); expect(fetcher.mock.calls.some(([, opts]) => opts?.method === "POST")).toBe(false); }
   finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
 });
 it("retains the exported image verifier contract", async () => { vi.stubGlobal("Image", class { onload: null | (() => void) = null; set src(_url: string) { queueMicrotask(() => this.onload?.()); } }); await expect(verifySlideImage("https://example.com/image.png")).resolves.toBeUndefined(); vi.unstubAllGlobals(); });
});
