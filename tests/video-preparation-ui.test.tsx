// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { StudioView } from "@/components/dashboard/sections";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
describe("Video preparation UI keeps generation locked", () => {
  it("disables the video tab, exposes both preparation modes and requests only a storyboard", async () => {
    const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url === "/api/studio/credits" ? { balance: 0 } : url.startsWith("/api/studio/history") ? { items: [] } : { prompt: "Storyboard simulé", locked: true } }));
    vi.stubGlobal("fetch", fetcher);
    const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
    try {
      await act(async () => root.render(<StudioView products={[{ id: "1", name: "Mon ebook" }]} />));
      const video = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b => b.textContent?.includes("studio.video"))!;
      expect(video.disabled).toBe(true);
      expect(container.textContent).toContain("Diaporama animé"); expect(container.textContent).toContain("Scènes avec personnages");
      expect(container.textContent?.toLowerCase()).not.toContain("carrousel");
      expect(container.querySelector("audio")).toBeNull();
      await act(async () => container.querySelectorAll<HTMLButtonElement>(".studio-product-list button")[1].click());
      const prepare = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Préparer le storyboard")!;
      await act(async () => prepare.click());
      const call = fetcher.mock.calls.find(([url]) => url === "/api/studio/prompt");
      expect(call).toBeTruthy(); expect(container.textContent).toContain("Storyboard simulé");
      expect(fetcher.mock.calls.some(([url]) => url === "/api/studio/video" || url === "/api/studio/image")).toBe(false);
    } finally { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); }
  });
});
