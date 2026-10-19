// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n/translate";
const language = vi.hoisted(() => ({ locale: "fr" as "fr" | "en" }));
vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({ locale: language.locale, t: (key: string) => translate(language.locale, key) }),
}));
import { PlatformMarquee } from "@/components/PlatformMarquee";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe("platform marquee", () => {
  it.each(["fr", "en"] as const)("renders all six brands and localized statuses in %s, with only one accessible copy", (locale) => {
    language.locale = locale;
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(<PlatformMarquee />);
    const lists = container.querySelectorAll("ul");
    expect(lists).toHaveLength(2);
    expect(lists[0].children).toHaveLength(6);
    expect(lists[1].getAttribute("aria-hidden")).toBe("true");
    expect(lists[0].innerHTML).toBe(lists[1].innerHTML);
    for (const name of ["Chariow", "Selar", "Gumroad", "Meta", "TikTok", "Pinterest"]) {
      const item = lists[0].querySelector(`.platform-marquee-${name.toLowerCase()}`)!;
      expect(item.innerHTML).toContain(name);
    }
    for (const name of ["selar", "gumroad"]) {
      expect(lists[0].querySelector(`.platform-marquee-${name} small`)?.textContent).toBe(`(${translate(locale, "landing.hero.soon")})`);
    }
    for (const name of ["meta", "tiktok", "pinterest"]) {
      expect(lists[0].querySelector(`.platform-marquee-${name} small`)?.textContent).toBe(`(${translate(locale, "sweep2.text124")})`);
    }
    expect(container.querySelector("#platform-marquee-title")?.textContent).toBe(translate(locale, "sweep3.text122"));
    expect(container.querySelector("[role=region]")?.getAttribute("tabindex")).toBe("0");
    expect(container.querySelectorAll("[aria-hidden=true] button, [aria-hidden=true] a")).toHaveLength(0);
  });

  it("toggles a persistent pause and resume with a native keyboard-operable button", async () => {
    language.locale = "fr";
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<PlatformMarquee />));
    const button = container.querySelector("button")!;
    expect(button.type).toBe("button");
    expect(button.getAttribute("aria-controls")).toBe("platform-marquee-viewport");
    await act(async () => button.click());
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toBe("Reprendre");
    expect(container.querySelector("section")?.getAttribute("data-paused")).toBe("true");
    await act(async () => button.click());
    expect(button.textContent).toBe("Pause");
    await act(async () => root.unmount());
    container.remove();
  });

  it("uses equal continuous loops, pauses on hover/focus and exposes all logos without animation in reduced-motion", () => {
    const css = readFileSync("app/platform-marquee.css", "utf8");
    expect(css).toContain("38s linear infinite");
    expect(css).toContain("translateX(-50%)");
    expect(css).toContain(":focus-within");
    expect(css).toContain(":hover");
    expect(css).toContain("animation-play-state: paused");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain('.platform-marquee-group[aria-hidden="true"] { display: none; }');
  });
});
