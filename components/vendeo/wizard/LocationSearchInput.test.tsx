// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const localeState = vi.hoisted(() => ({ locale: "fr" as string }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: localeState.locale, t: (key: string) => key }) }));
import { LocationSearchInput } from "./LocationSearchInput";
import type { GeoLocation } from "./types";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localeState.locale = "fr";
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

function ControlledLocationSearch({ onChange, platform, allowCountryGroups }: { onChange: (locations: GeoLocation[]) => void; platform: "meta" | "tiktok"; allowCountryGroups: boolean }) {
  const [value, setValue] = useState<GeoLocation[]>([]);
  return createElement(LocationSearchInput, {
    value,
    onChange: (locations) => { setValue(locations); onChange(locations); },
    platform,
    allowCountryGroups,
  });
}

function renderSearch(onChange: (locations: GeoLocation[]) => void, platform: "meta" | "tiktok" = "meta", allowCountryGroups = true) {
  act(() => root.render(createElement(ControlledLocationSearch, { onChange, platform, allowCountryGroups })));
}

describe("LocationSearchInput country groups", () => {
  it("propose puis sélectionne Afrique en français dans le ciblage manuel Meta", () => {
    const selected: GeoLocation[][] = [];
    renderSearch((locations) => selected.push(locations));
    enterQuery("Afrique");
    const option = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "AfriqueZone");
    expect(option).toBeTruthy();
    act(() => option!.click());
    expect(selected.at(-1)).toEqual([{ key: "africa", name: "Afrique", type: "country_group", countryCodes: [] }]);
    expect(container.textContent).toContain("Afrique");
  });

  it("propose puis sélectionne Europe en français", () => {
    const selected: GeoLocation[][] = [];
    renderSearch((locations) => selected.push(locations));
    enterQuery("Europe");
    const option = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "EuropeZone");
    expect(option).toBeTruthy();
    act(() => option!.click());
    expect(selected.at(-1)).toEqual([{ key: "europe", name: "Europe", type: "country_group", countryCodes: [] }]);
  });

  it("affiche et sélectionne Afrique et Europe avec les libellés anglais", () => {
    localeState.locale = "en";
    const selected: GeoLocation[][] = [];
    renderSearch((locations) => selected.push(locations));

    enterQuery("Africa");
    let option = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "AfricaRegion");
    expect(option).toBeTruthy();
    act(() => option!.click());
    expect(selected.at(-1)?.[0]).toMatchObject({ key: "africa", name: "Africa", type: "country_group" });
    expect(container.textContent).toContain("Africa");

    enterQuery("Europe");
    option = [...container.querySelectorAll("button")].find((button) => button.textContent?.trim() === "EuropeRegion");
    expect(option).toBeTruthy();
    act(() => option!.click());
    expect(selected.at(-1)?.[1]).toMatchObject({ key: "europe", name: "Europe", type: "country_group" });
  });

  it("ne propose pas les groupes sur les écrans non autorisés ou les autres plateformes", () => {
    renderSearch(() => {}, "meta", false);
    enterQuery("Europe");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "EuropeZone")).toBe(false);

    renderSearch(() => {}, "tiktok", true);
    enterQuery("Europe");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent?.trim() === "EuropeZone")).toBe(false);
  });
});
