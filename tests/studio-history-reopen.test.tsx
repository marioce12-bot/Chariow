// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioView } from "../components/dashboard/sections";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
vi.mock("@/components/studio/SlideshowStudio", () => ({ SlideshowStudio: ({ selectedTaskId }: { selectedTaskId: string | null }) => <div data-testid="slideshow-studio" data-selected-task-id={selectedTaskId ?? "none"} /> }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let historyItems: any[];
const images = [
  { id: "v1", kind: "video", prompt: "Vidéo un", status: "completed", credits_cost: 1, mediaUrl: "https://media.test/one.mp4", created_at: "2026-01-01" },
  { id: "v2", kind: "video", prompt: "Vidéo deux", status: "completed", credits_cost: 1, mediaUrl: "https://media.test/two.mp4", created_at: "2026-01-02" },
  { id: "i1", kind: "image", prompt: "Photo historique", status: "completed", credits_cost: 1, mediaUrl: "https://media.test/photo.png", created_at: "2026-01-03" },
  { id: "s1", kind: "video", creationType: "slideshow", metadata: { type: "slideshow", duration: 12 }, sourceImageCount: 4, thumbnailUrl: "https://media.test/poster.jpg", status: "completed", mediaUrl: "https://media.test/final.mp4", prompt: "Final diaporama", credits_cost: 2, created_at: "2026-01-04" },
  { id: "s-missing", kind: "video", creationType: "slideshow", mediaState: "missing", sourceImageCount: 3, status: "completed", prompt: "Sans MP4", credits_cost: 2, created_at: "2026-01-05" },
];
const response = (data: unknown) => Promise.resolve({ ok: true, json: async () => data });
function render() { act(() => root.render(<StudioView products={[]} />)); }
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
beforeEach(() => {
  historyItems = images;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  fetchMock = vi.fn(async (url: string) => url === "/api/studio/credits" ? response({ balance: 10 }) : url.startsWith("/api/studio/history") ? response({ items: historyItems, nextCursor: null }) : response({}));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
describe("Studio history reopening", () => {
  it("offers image, slideshow and video choices and opens the matching workspace", async () => {
    render(); await settle();
    const frames = container.querySelectorAll<HTMLElement>(".studio-mobile-choice");
    const choices = container.querySelectorAll<HTMLButtonElement>(".studio-mobile-choice-select");
    expect(frames).toHaveLength(3);
    expect([...frames].map((frame) => frame.getAttribute("data-studio-format"))).toEqual(["image", "slideshow", "video"]);
    expect([...frames].every((frame) => frame.querySelector(".studio-mobile-choice-preview")?.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(choices).toHaveLength(3);
    expect([...choices].map((button) => button.textContent)).toEqual(["Sélectionner", "Sélectionner", "Sélectionner"]);
    expect(container.querySelector("#studio-mobile-start-title")).toBeNull();
    expect(container.textContent).not.toContain("TON ESPACE CRÉATIF");
    expect(container.textContent).not.toContain("studio.subtitle");
    expect(container.querySelector(".studio-page")?.classList.contains("is-open")).toBe(false);
    await act(async () => choices[1].click());
    expect(container.querySelector(".studio-page")?.classList.contains("is-open")).toBe(true);
    expect(container.querySelector("#studio-slideshow-panel")?.hasAttribute("hidden")).toBe(false);
    await act(async () => container.querySelector<HTMLButtonElement>(".studio-mobile-back")!.click());
    expect(container.querySelector(".studio-page")?.classList.contains("is-open")).toBe(false);
    await act(async () => container.querySelectorAll<HTMLButtonElement>(".studio-mobile-choice-select")[2].click());
    expect(container.querySelector(".studio-coming-soon")?.textContent).toContain("studio.videoComingSoonText");
  });
  it("switches between two history videos, independent of video_job_id", async () => {
    render(); await settle();
    const cards = container.querySelectorAll<HTMLElement>(".studio-history-card");
    await act(async () => cards[0].click());
    expect(container.querySelector(".studio-history-viewer video")?.getAttribute("src")).toBe("https://media.test/one.mp4");
    await act(async () => cards[1].click());
    expect(container.querySelector(".studio-history-viewer video")?.getAttribute("src")).toBe("https://media.test/two.mp4");
    expect(container.querySelector(".studio-history-viewer video")?.hasAttribute("controls")).toBe(true);
    expect(container.querySelector(".studio-history-viewer video")?.hasAttribute("playsinline")).toBe(true);
    expect(fetchMock.mock.calls.some(([url, init]) => ["/api/studio/video", "/api/studio/image"].includes(String(url)) && init?.method === "POST")).toBe(false);
  });
  it("downloads an existing history MP4 locally without opening its remote URL or creating a generation", async () => {
    const createObjectURL = vi.fn(() => "blob:history-video");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const clicks: Array<{ href: string; download: string }> = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.href, download: this.download });
    });
    try {
      render(); await settle();
      await act(async () => container.querySelectorAll<HTMLElement>(".studio-history-card")[3].click());
      const viewer = container.querySelector(".studio-history-viewer")!;
      expect(viewer.querySelector("a[href]")).toBeNull();
      const download = Array.from(viewer.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "studio.downloadVideo")!;
      expect(download).toBeTruthy();
      fetchMock.mockImplementation(async (url: string) => {
        if (url === "https://media.test/final.mp4") return { ok: true, blob: async () => new Blob(["existing MP4"], { type: "video/mp4" }) };
        return response({});
      });
      await act(async () => download.click());
      expect(fetchMock).toHaveBeenCalledWith("https://media.test/final.mp4");
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clicks).toHaveLength(1);
      expect(clicks[0].href).toBe("blob:history-video");
      expect(clicks[0].download).toMatch(/\.mp4$/);
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    } finally { click.mockRestore(); }
  });
  it("opens an image from the slideshow tab without switching or requiring a job id", async () => {
    render(); await settle();
    await act(async () => container.querySelector<HTMLButtonElement>("#studio-slideshow-tab")!.click());
    expect(container.querySelector("#studio-slideshow-panel")?.hasAttribute("hidden")).toBe(false);
    await act(async () => container.querySelectorAll<HTMLElement>(".studio-history-card")[2].click());
    expect(container.querySelector(".studio-history-viewer img")?.getAttribute("src")).toBe("https://media.test/photo.png");
    expect(container.querySelector("#studio-slideshow-panel")?.hasAttribute("hidden")).toBe(false);
    const card = container.querySelectorAll<HTMLElement>(".studio-history-card")[2];
    await act(async () => { card.focus(); card.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(container.querySelector(".studio-history-viewer img")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).startsWith("/api/studio/") && init?.method === "POST")).toBe(false);
  });
  it("identifies the final slideshow, displays its poster and caption, and does not treat source photos as a slideshow", async () => {
    render(); await settle();
    const cards = container.querySelectorAll<HTMLElement>(".studio-history-card");
    expect(cards[2].querySelector("strong")?.textContent).toBe("Image");
    expect(cards[3].querySelector("strong")?.textContent).toBe("Diaporama");
    expect(cards[3].querySelector("img")?.getAttribute("src")).toBe("https://media.test/poster.jpg");
    expect(cards[3].textContent).toContain("12s");
    expect(cards[3].textContent).toContain("4 images sources");
    await act(async () => cards[3].click());
    const video = container.querySelector<HTMLVideoElement>(".studio-history-viewer video");
    expect(video?.getAttribute("src")).toBe("https://media.test/final.mp4");
    expect(video?.getAttribute("poster")).toBe("https://media.test/poster.jpg");
    expect(video?.getAttribute("aria-label")).toBe("Diaporama");
  });
  it("opens an unfinished background slideshow in the workspace with its exact task ID, while completed MP4 stays in history player", async () => {
    historyItems = [...images, { id: "task-slideshow-42", kind: "video", creationType: "slideshow", metadata: { type: "studio_background_task", taskKind: "slideshow" }, status: "processing", credits_cost: 0, prompt: "Diaporama", created_at: "2026-01-06" }];
    render(); await settle();
    const cards = container.querySelectorAll<HTMLElement>(".studio-history-card");
    await act(async () => cards[5].click());
    expect(container.querySelector("#studio-slideshow-panel")?.hasAttribute("hidden")).toBe(false);
    expect(container.querySelector("[data-testid=slideshow-studio]")?.getAttribute("data-selected-task-id")).toBe("task-slideshow-42");
    expect(container.querySelector(".studio-history-viewer")).toBeNull();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).startsWith("/api/studio/") && init?.method === "POST")).toBe(false);
    await act(async () => cards[3].click());
    expect(container.querySelector(".studio-history-viewer video")?.getAttribute("src")).toBe("https://media.test/final.mp4");
    expect(container.querySelector(".studio-history-viewer video")?.getAttribute("poster")).toBe("https://media.test/poster.jpg");
  });
  it("shows missing final MP4 information without a player or regeneration action", async () => {
    render(); await settle();
    await act(async () => container.querySelectorAll<HTMLElement>(".studio-history-card")[4].click());
    expect(container.querySelector(".studio-history-viewer")?.textContent).toContain("MP4 final introuvable. Les images sources sont conservées. Aucune régénération automatique.");
    expect(container.querySelector(".studio-history-viewer video")).toBeNull();
    expect(container.querySelector(".studio-history-viewer button")).toBeNull();
  });
  it("keeps all-history and video filtering navigation working", async () => {
    render(); await settle();
    const filters = container.querySelectorAll<HTMLButtonElement>(".studio-history-toolbar button");
    await act(async () => filters[2].click()); await settle();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("kind=video"))).toBe(true);
    await act(async () => filters[0].click()); await settle();
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/studio/history?")).toBe(true);
    expect(container.querySelectorAll(".studio-history-card").length).toBe(5);
  });
  it("keeps prompt, edit, and delete action clicks from opening their card", async () => {
    render(); await settle();
    const card = container.querySelectorAll<HTMLElement>(".studio-history-card")[0];
    const imageCard = container.querySelectorAll<HTMLElement>(".studio-history-card")[2];
    vi.stubGlobal("confirm", () => false);
    await act(async () => card.querySelectorAll(".studio-history-actions button")[0].dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector(".studio-history-viewer")).toBeNull();
    await act(async () => imageCard.querySelectorAll(".studio-history-actions button")[1].dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector(".studio-history-viewer")).toBeNull();
    await act(async () => imageCard.querySelectorAll(".studio-history-actions button")[2].dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector(".studio-history-viewer")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/studio/history/"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).startsWith("/api/studio/") && init?.method === "POST")).toBe(false);
  });
});
