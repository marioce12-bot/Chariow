import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioDesktopProductFields } from "./StudioDesktopProductFields";

const { JSDOM } = require("jsdom") as {
  JSDOM: new (html: string, options: { url: string }) => any;
};

let dom: any;
let container: HTMLElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
    url: "http://localhost",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
  });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  container = dom.window.document.getElementById("root")!;
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  dom.window.close();
  vi.restoreAllMocks();
});

describe("StudioDesktopProductFields", () => {
  it("shows the slideshow product details without introducing a prompt field", () => {
    act(() => root.render(createElement(StudioDesktopProductFields, {
      products: [{ id: "p1", name: "Atelier", description: "Une boutique artisanale." }],
      selectedProduct: { id: "p1", name: "Atelier", description: "Une boutique artisanale." },
      onSelect: vi.fn(),
      locale: "fr",
      mode: "slideshow",
    })));

    expect(container.querySelector("h2")?.textContent).toBe("Votre produit");
    expect((container.querySelector("select") as HTMLSelectElement).value).toBe("p1");
    expect(container.querySelector(".studio-product-description-value")?.textContent).toBe("Une boutique artisanale.");
    expect(container.textContent).not.toMatch(/prompt|générer/i);
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("routes a desktop selection to the existing product selection callback", () => {
    const onSelect = vi.fn();
    act(() => root.render(createElement(StudioDesktopProductFields, {
      products: [
        { id: "p1", name: "Atelier" },
        { id: "p2", name: "Maison" },
      ],
      selectedProduct: { id: "p1", name: "Atelier" },
      onSelect,
      locale: "fr",
      mode: "video",
    })));

    const select = container.querySelector("select") as HTMLSelectElement;
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(
        dom.window.HTMLSelectElement.prototype,
        "value",
      )?.set;
      setValue?.call(select, "p2");
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledWith("p2");
    expect(container.querySelector("textarea")).toBeNull();
  });
});
