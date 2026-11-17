// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
import { LocationSearchInput } from "./LocationSearchInput";
import type { GeoLocation } from "./types";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function enterQuery(value: string) {
  const input = container.querySelector<HTMLInputElement>("input")!;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("LocationSearchInput country groups", () => {
  it("propose puis sélectionne Afrique dans le ciblage manuel Meta", () => {
    const selected: GeoLocation[][] = [];
    act(() => root.render(createElement(LocationSearchInput, {
      value: [],
      onChange: (locations: GeoLocation[]) => selected.push(locations),
      platform: "meta",
      allowCountryGroups: true,
    })));
    enterQuery("Afrique");
    const option = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "AfriqueZone");
    expect(option).toBeTruthy();
    act(() => option!.click());
    expect(selected.at(-1)).toEqual([{ key: "africa", name: "Afrique", type: "country_group", countryCodes: [] }]);
  });

  it("ne propose pas Afrique aux autres plateformes ni aux écrans qui ne l’autorisent pas", () => {
    act(() => root.render(createElement(LocationSearchInput, {
      value: [],
      onChange: () => {},
      platform: "meta",
      allowCountryGroups: false,
    })));
    enterQuery("Afrique");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "AfriqueZone")).toBe(false);

    act(() => root.render(createElement(LocationSearchInput, {
      value: [],
      onChange: () => {},
      platform: "tiktok",
      allowCountryGroups: true,
    })));
    enterQuery("Afrique");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "AfriqueZone")).toBe(false);
  });
});
