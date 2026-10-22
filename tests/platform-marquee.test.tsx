// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n/translate";
const language = vi.hoisted(() => ({ locale: "fr" as "fr" | "en" }));
vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({ locale: language.locale, t: (key: string) => translate(language.locale, key) }),
}));
import { PlatformMarquee } from "@/components/PlatformMarquee";

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
    expect(lists[0].querySelector(".platform-marquee-chariow small")).toBeNull();
    expect(container.querySelector("#platform-marquee-title")?.textContent).toBe(translate(locale, "sweep3.text122"));
    const region = container.querySelector("[role=region]");
    expect(region?.getAttribute("aria-labelledby")).toBe("platform-marquee-title");
    expect(region?.getAttribute("aria-describedby")).toBe("platform-marquee-help");
    expect(region?.getAttribute("tabindex")).toBeNull();
    expect(container.querySelectorAll("[aria-hidden=true] button, [aria-hidden=true] a")).toHaveLength(0);
    expect(container.querySelector("#platform-marquee-help")?.textContent).toBe(translate(locale, "sweep3.text122") ? (locale === "en" ? "With reduced motion, scroll horizontally to explore all platforms." : "Avec les animations réduites, faites défiler horizontalement pour découvrir toutes les plateformes.") : "");
  });

  it("runs an uninterrupted duplicated loop and exposes a static horizontal scroller for reduced motion", () => {
    const css = readFileSync("app/platform-marquee.css", "utf8");
    expect(css).toContain("animation: platform-marquee-left 22s linear infinite");
    expect(css).toContain("translateX(-50%)");
    expect(css).not.toContain(":focus-within");
    expect(css).not.toContain(":hover");
    expect(css).not.toContain("animation-play-state: paused");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(".platform-marquee-track { animation: none; transform: none; }");
    expect(css).toContain(".platform-marquee-group[aria-hidden=\"true\"] { display: none; }");
    expect(css).toContain(".platform-marquee-viewport { overflow-x: auto; mask-image: none; }");
  });
});
