// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMobileNavVisibility } from "@/components/dashboard/useMobileNavVisibility";

let root: Root;
let container: HTMLDivElement;
function Navigation({ section = "home" }: { section?: string }) {
  const visible = useMobileNavVisibility(section);
  return <nav className="mobile-nav" data-visible={String(visible)}><button>Accueil</button></nav>;
}
function scroll(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  act(() => window.dispatchEvent(new Event("scroll")));
}
const visible = () => container.querySelector("nav")!.getAttribute("data-visible");
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<Navigation />));
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
describe("mobile navigation scrolling", () => {
  it("hides downwards and reveals on reverse scroll without jitter", () => {
    expect(visible()).toBe("true");
    scroll(10); expect(visible()).toBe("true");
    scroll(30); expect(visible()).toBe("false");
    scroll(26); expect(visible()).toBe("false");
    scroll(14); expect(visible()).toBe("true");
  });
  it("reveals at the top, on section change, and when a nav button receives focus", () => {
    scroll(100); expect(visible()).toBe("false");
    scroll(0); expect(visible()).toBe("true");
    scroll(100); expect(visible()).toBe("false");
    act(() => root.render(<Navigation section="ads" />)); expect(visible()).toBe("true");
    scroll(140); expect(visible()).toBe("false");
    act(() => container.querySelector("button")!.focus()); expect(visible()).toBe("true");
  });
  it("ignores nested dialog scrolling and desktop viewport scrolling", () => {
    const dialog = document.createElement("div"); container.append(dialog);
    act(() => dialog.dispatchEvent(new Event("scroll"))); expect(visible()).toBe("true");
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    scroll(100); expect(visible()).toBe("true");
  });
});
