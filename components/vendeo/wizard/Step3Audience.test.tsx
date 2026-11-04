import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { JSDOM } = require("jsdom");

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
vi.mock("./LocationSearchInput", () => ({ LocationSearchInput: () => createElement("div", { "data-testid": "location-input" }) }));

import { Step3Audience } from "./Step3Audience";
import { DEFAULT_WIZARD_STATE, type WizardState } from "./types";

let dom: any;
let container: HTMLElement;
let root: Root;

function Harness() {
  const [state, setState] = useState<WizardState>({
    ...DEFAULT_WIZARD_STATE,
    platform: "meta",
    metaAdAccountId: "meta-account-1",
    maxAge: 45,
    advantageAudience: false,
  });
  return createElement(Step3Audience, {
    state,
    patch: (partial: Partial<WizardState>) => setState((current) => ({ ...current, ...partial })),
    onNext: () => {},
    onBack: () => {},
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  container = document.getElementById("root")!;
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.window.close();
});

describe("Step3Audience age range with Advantage+", () => {
  it("locks the maximum age to 65 only while Advantage+ is enabled", async () => {
    await act(async () => root.render(createElement(Harness)));
    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    let maximum = container.querySelector<HTMLInputElement>('input[aria-label="Âge maximum"]')!;
    expect(maximum.value).toBe("45");
    expect(maximum.disabled).toBe(false);

    await act(async () => toggle.click());
    maximum = container.querySelector<HTMLInputElement>('input[aria-label="Âge maximum"]')!;
    expect(maximum.value).toBe("65");
    expect(maximum.disabled).toBe(true);
    expect(container.textContent).toContain("l’âge maximal est fixé à 65 ans");

    await act(async () => toggle.click());
    maximum = container.querySelector<HTMLInputElement>('input[aria-label="Âge maximum"]')!;
    expect(maximum.disabled).toBe(false);
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
    setValue?.call(maximum, "40");
    await act(async () => maximum.dispatchEvent(new dom.window.Event("input", { bubbles: true })));
    maximum = container.querySelector<HTMLInputElement>('input[aria-label="Âge maximum"]')!;
    expect(maximum.value).toBe("40");
  });
});
