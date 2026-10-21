import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignMedia } from "./CampaignMedia";
const { JSDOM } = require("jsdom");

let dom: any;
let root: Root;
let container: HTMLElement;
const base = { src: "https://cdn.example/photo.jpg?signature=keep-me", alt: "Campagne", unavailableLabel: "Aperçu indisponible" };

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
  container = document.getElementById("root")!;
  root = createRoot(container);
  vi.useFakeTimers();
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); dom.window.close(); });

const render = async (props = {}) => { await act(async () => root.render(createElement(CampaignMedia, { ...base, ...props }))); };
const fail = async () => { await act(async () => container.querySelector("img,video")!.dispatchEvent(new dom.window.Event("error"))); };

describe("CampaignMedia", () => {
  it("renders an image without altering its signed URL", async () => {
    await render();
    expect(container.querySelector("img")?.src).toBe(base.src);
    expect(container.querySelector("video")).toBeNull();
  });
  it("revalidates once and retries a failed image even when its URL is unchanged", async () => {
    const recover = vi.fn();
    await render({ onUnavailable: recover });
    const oldImage = container.querySelector("img");
    await fail();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(base.unavailableLabel);
    expect(recover).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1500));
    const retry = container.querySelector("img");
    expect(retry).not.toBe(oldImage);
    expect(retry?.src).toBe(base.src);
    await fail();
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(container.querySelector("img")).toBeNull();
    expect(recover).toHaveBeenCalledTimes(1);
  });
  it("resets fallback immediately when synchronization supplies a fresh URL", async () => {
    await render();
    await fail();
    await render({ src: "https://cdn.example/fresh.jpg" });
    expect(container.querySelector("img")?.src).toBe("https://cdn.example/fresh.jpg");
    expect(container.querySelector('[role="img"]')).toBeNull();
    await act(async () => vi.advanceTimersByTime(1500));
    expect(container.querySelector("img")?.src).toBe("https://cdn.example/fresh.jpg");
  });
  it.each(["https://cdn.example/movie.mp4?token=abc", "https://res.cloudinary.com/demo/video/upload/clip"]) ("does not pass a video URL to an image element: %s", async (src) => {
    await render({ src });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("video")?.src).toBe(src);
    expect(container.querySelector("video")?.controls).toBe(false);
    expect(container.querySelector("video")?.autoplay).toBe(false);
  });
  it("provides video controls in detail and a readable fallback on failure", async () => {
    await render({ src: "https://cdn.example/movie.mp4", controls: true });
    expect(container.querySelector("video")?.controls).toBe(true);
    await fail();
    expect(container.textContent).toContain(base.unavailableLabel);
  });
  it("contains recovery failures without an unhandled rejection or retry loop", async () => {
    const recover = vi.fn().mockRejectedValue(new Error("offline"));
    await render({ onUnavailable: recover });
    await fail();
    await act(async () => vi.advanceTimersByTime(1500));
    expect(container.querySelector("img")).not.toBeNull();
    expect(recover).toHaveBeenCalledTimes(1);
  });
  it("cancels a pending retry on unmount", async () => {
    await render();
    await fail();
    await act(async () => root.render(null));
    await act(async () => vi.advanceTimersByTime(1500));
    expect(container.childNodes).toHaveLength(0);
  });
});
