import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Children, isValidElement, type ReactNode } from "react";

// Exercise the component's real timer and event handlers without adding a DOM dependency.
const hooks = vi.hoisted(() => ({
  states: [] as unknown[],
  index: 0,
  effects: [] as Array<() => void | (() => void)>,
  locale: "fr",
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (next: unknown) => {
      hooks.states[index] = typeof next === "function" ? next(hooks.states[index]) : next;
    }];
  },
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect); },
}));
vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({ locale: hooks.locale, t: (key: string) => key }),
}));
import { Marketing } from "@/components/Marketing";

type Element = import("react").ReactElement<Record<string, any>>;
function find(node: ReactNode, className: string): Element {
  if (isValidElement<Record<string, any>>(node)) {
    if (node.props.className === className) return node;
    for (const child of Children.toArray(node.props.children)) {
      const found = find(child, className);
      if (found) return found;
    }
  }
  return undefined as unknown as Element;
}
function render() {
  hooks.index = 0;
  hooks.effects = [];
  return Marketing();
}
function label() { return find(render(), "showcase-screen").props["aria-label"]; }
function effect() { return hooks.effects[0](); }
function key(value: string) {
  const preventDefault = vi.fn();
  find(render(), "landing-showcase").props.onKeyDown({ key: value, preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
}
let cleanup: void | (() => void);
beforeEach(() => {
  vi.useFakeTimers();
  hooks.states = [];
  hooks.locale = "fr";
  cleanup = undefined;
  vi.stubGlobal("window", {
    setTimeout, clearTimeout,
    matchMedia: vi.fn(() => ({ matches: false })),
  });
});
afterEach(() => {
  if (typeof cleanup === "function") cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("landing carousel cadence and controls", () => {
  it.each(["fr", "en"])("rotates every 2700 ms and wraps in %s", locale => {
    hooks.locale = locale;
    const labels = locale === "en" ? ["Home", "Launch ads", "AI Studio"] : ["Accueil", "Lancement de publicités", "Studio IA"];
    render();
    cleanup = effect();
    expect(label()).toBe(labels[0]);
    vi.advanceTimersByTime(2699);
    expect(label()).toBe(labels[0]);
    vi.advanceTimersByTime(1);
    expect(label()).toBe(labels[1]);
    cleanup?.(); render(); cleanup = effect();
    vi.advanceTimersByTime(2700);
    expect(label()).toBe(labels[2]);
    cleanup?.(); render(); cleanup = effect();
    vi.advanceTimersByTime(2700);
    expect(label()).toBe(labels[0]);
    cleanup?.(); render(); cleanup = effect();
    expect(vi.getTimerCount()).toBe(1);
  });
  it("keeps entrance animations plus rotation below the 3000 ms budget", () => {
    const css = readFileSync("app/landing-premium.css", "utf8");
    const animations = [...css.matchAll(/animation:lp(?:Slide|Screen)In ([.\d]+)s/g)];
    expect(animations.length).toBeGreaterThanOrEqual(2);
    for (const [, seconds] of animations) {
      expect(Number(seconds)).toBe(0.24);
      expect(2700 + Number(seconds) * 1000).toBeLessThanOrEqual(3000);
    }
  });
  it("supports immediate keyboard navigation and continues autoplay while focused", () => {
    render(); cleanup = effect();
    key("ArrowRight"); expect(label()).toBe("Lancement de publicités");
    cleanup?.(); render(); cleanup = effect();
    key("End"); expect(label()).toBe("Studio IA");
    key("Home"); expect(label()).toBe("Accueil");
    key("ArrowLeft"); expect(label()).toBe("Studio IA");
    vi.advanceTimersByTime(2700);
    expect(label()).toBe("Accueil");
  });
  it("supports swipe navigation and continues autoplay after touch", () => {
    const currentTarget = { dataset: {} };
    find(render(), "landing-showcase").props.onTouchStart({ currentTarget, touches: [{ clientX: 150 }] });
    find(render(), "landing-showcase").props.onTouchEnd({ currentTarget, changedTouches: [{ clientX: 50 }] });
    expect(label()).toBe("Lancement de publicités");
    cleanup = effect();
    vi.advanceTimersByTime(2699);
    expect(label()).toBe("Lancement de publicités");
    vi.advanceTimersByTime(1);
    expect(label()).toBe("Studio IA");
  });
  it("continues autoplay without pausing on hover", () => {
    render(); cleanup = effect();
    const showcase = find(render(), "landing-showcase");
    expect(showcase.props.onMouseEnter).toBeUndefined();
    expect(showcase.props.onFocusCapture).toBeUndefined();
    vi.advanceTimersByTime(2700);
    expect(label()).toBe("Lancement de publicités");
  });
  it("disables autoplay for reduced motion but retains manual changes", () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    render(); cleanup = effect();
    vi.advanceTimersByTime(9000);
    expect(label()).toBe("Accueil");
    expect(vi.getTimerCount()).toBe(0);
    key("ArrowRight");
    expect(label()).toBe("Lancement de publicités");
  });
  it("clears the autoplay timer on unmount", () => {
    render(); cleanup = effect();
    expect(vi.getTimerCount()).toBe(1);
    cleanup?.(); cleanup = undefined;
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(9000);
    expect(label()).toBe("Accueil");
  });
});
