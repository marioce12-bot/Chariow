// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioHomeOnboarding, type StudioCreationMode } from "./StudioHomeOnboarding";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot> | null = null;

function mount(onClose = vi.fn(), onSelectMode = vi.fn<(mode: StudioCreationMode) => void>()) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(createElement(StudioHomeOnboarding, { open: true, locale: "fr", onClose, onSelectMode }));
  });
  return { onClose, onSelectMode };
}

beforeEach(() => {
  document.body.style.overflow = "";
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  container?.remove();
  document.body.style.overflow = "";
  vi.clearAllMocks();
});

describe("StudioHomeOnboarding", () => {
  it("affiche les trois formats avec les vignettes existantes", () => {
    mount();
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-studio-format]")).toHaveLength(3);
    expect(container.querySelector('[data-studio-format="image"] img')?.getAttribute("src")).toBe("/studio-format-previews/image-poster.jpeg");
    expect(container.querySelector('[data-studio-format="slideshow"] img')?.getAttribute("src")).toBe("/studio-format-previews/slideshow-poster.webp");
    expect(container.querySelector('[data-studio-format="video"] img')?.getAttribute("src")).toBe("/studio-format-previews/video-poster.webp");
    expect(container.textContent).toContain("Que veux-tu créer aujourd’hui ?");
  });

  it("envoie le format sélectionné au flux appelant", () => {
    const { onSelectMode } = mount();
    const button = container.querySelector<HTMLButtonElement>('[data-studio-format="slideshow"] button');
    act(() => button?.click());
    expect(onSelectMode).toHaveBeenCalledWith("slideshow");
  });

  it("permet de fermer avec la croix ou la touche Échap", () => {
    const { onClose } = mount();
    const closeButton = container.querySelector<HTMLButtonElement>(".studio-home-onboarding-close");
    act(() => closeButton?.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
