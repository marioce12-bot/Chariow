import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditableCampaign } from "./types";
const { JSDOM } = require("jsdom");

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
vi.mock("./ChannelSelector", () => ({ ChannelSelector: () => createElement("section", { "data-testid": "channel-selector" }) }));
vi.mock("./Step1Product", () => ({ Step1Product: ({ state }: { state: { product: { id: string } | null } }) => createElement("div", { "data-testid": "product-step", "data-product-id": state.product?.id ?? "" }) }));
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

async function renderWizard(initialProduct?: unknown, duplicateCampaign?: EditableCampaign) {
  await act(async () => root.render(createElement(LaunchAdWizard, {
    storeId: "store-1",
    plan: "starter",
    onClose: vi.fn(),
    ...(initialProduct ? { initialProduct: initialProduct as never } : {}),
    ...(duplicateCampaign ? { duplicateCampaign } : {}),
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

  it("opens a duplicate on product selection with the copied product still selected", async () => {
    const campaign: EditableCampaign = { id: "campaign-1", product_id: "product-1", product_name: "Produit copié", platform: "meta", daily_budget: 5, duration_days: 3 };
    await renderWizard(undefined, campaign);
    expect(document.body.querySelector("[data-testid='channel-selector']")).not.toBeNull();
    expect(document.body.querySelector("[data-testid='product-step']")?.getAttribute("data-product-id")).toBe("product-1");
  });

  it("does not invent a selected product when the copied campaign has no product ID", async () => {
    const campaign: EditableCampaign = { id: "campaign-1", product_id: null, product_name: "Produit ancien", platform: "meta", daily_budget: 5, duration_days: 3 };
    await renderWizard(undefined, campaign);
    expect(document.body.querySelector("[data-testid='product-step']")?.getAttribute("data-product-id")).toBe("");
  });
});
