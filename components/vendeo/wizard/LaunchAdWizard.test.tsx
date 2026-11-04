import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { JSDOM } = require("jsdom");

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
vi.mock("./ChannelSelector", () => ({ ChannelSelector: () => createElement("section", { "data-testid": "channel-selector" }) }));
vi.mock("./Step1Product", () => ({ Step1Product: () => createElement("div", { "data-testid": "product-step" }) }));
vi.mock("./Step2NetworkCreative", () => ({ Step2NetworkCreative: () => createElement("div", { "data-testid": "creative-step" }) }));
vi.mock("./Step3Audience", () => ({ Step3Audience: () => createElement("div", { "data-testid": "audience-step" }) }));
vi.mock("./Step4Budget", () => ({ Step4Budget: () => createElement("div", { "data-testid": "budget-step" }) }));
vi.mock("./Step5Payment", () => ({ Step5Payment: () => createElement("div", { "data-testid": "payment-step" }) }));

import { LaunchAdWizard } from "./LaunchAdWizard";

let dom: any;
let container: HTMLElement;
let root: Root;

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

async function renderWizard(initialProduct?: unknown) {
  await act(async () => root.render(createElement(LaunchAdWizard, {
    storeId: "store-1",
    plan: "starter",
    onClose: vi.fn(),
    ...(initialProduct ? { initialProduct: initialProduct as never } : {}),
  })));
}

describe("LaunchAdWizard network selector placement", () => {
  it("shows the network selector on the product-selection step", async () => {
    await renderWizard();
    expect(document.body.querySelector("[data-testid='channel-selector']")).not.toBeNull();
    expect(document.body.querySelector("[data-testid='product-step']")).not.toBeNull();
  });

  it("does not repeat the network selector after a product is preselected", async () => {
    await renderWizard({ id: "product-1", name: "Produit test", url: "https://example.com" });
    expect(document.body.querySelector("[data-testid='channel-selector']")).toBeNull();
    expect(document.body.querySelector("[data-testid='creative-step']")).not.toBeNull();
  });
});
