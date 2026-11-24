// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { useMobileNavVisibility } from "./useMobileNavVisibility";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function VisibilityProbe({ section }: { section: string }) {
  return createElement("output", { "data-visible": String(useMobileNavVisibility(section)) });
}

describe("mobile dashboard navigation visibility", () => {
  it("stays visible across sections and after scrolling", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      for (const section of ["Vue d'ensemble", "Pub", "Vendeo AI", "Studio", "Radar marché"]) {
        act(() => root.render(createElement(VisibilityProbe, { section })));
        expect(container.querySelector("output")?.getAttribute("data-visible")).toBe("true");
        act(() => window.dispatchEvent(new Event("scroll")));
        expect(container.querySelector("output")?.getAttribute("data-visible")).toBe("true");
      }
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
