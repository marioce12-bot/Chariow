// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WIZARD_STATE, type WizardState } from "../components/vendeo/wizard/types";
import { Step1Product } from "../components/vendeo/wizard/Step1Product";

let locale: "fr" | "en" = "fr";
vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({ locale, t: (key: string) => ({
    "wizardExtra.product.description": locale === "en" ? "Choose a product" : "Choisissez un produit",
    "wizardExtra.product.store": locale === "en" ? "Store" : "Boutique",
    "wizardExtra.product.search": locale === "en" ? "Search" : "Rechercher",
    "wizardExtra.product.loading": locale === "en" ? "Loading products…" : "Chargement des produits…",
    "wizardExtra.product.empty": locale === "en" ? "No products" : "Aucun produit",
    "wizardExtra.product.noImage": locale === "en" ? "No image" : "Pas d'image",
    "wizardExtra.product.continue": locale === "en" ? "Continue" : "Continuer",
    "wizardExtra.error.stores": "store error",
    "wizardExtra.error.products": "product error",
    "wizardExtra.error.unknown": "unknown error",
  }[key] ?? key) }),
}));

const products = {
  first: { id: "p1", name: "Produit Alpha", description: null, price: null, currency: null, image: null, url: "https://shop.test/p1" },
  second: { id: "p2", name: "Produit Beta", description: null, price: null, currency: null, image: null, url: "https://shop.test/p2" },
  otherStore: { id: "p3", name: "Produit Gamma", description: null, price: null, currency: null, image: null, url: "https://other.test/p3" },
};
const stores = [
  { id: "store-a", store_name: "Boutique A", platform: "chariow", connection_status: "connected" },
  { id: "store-b", store_name: "Boutique B", platform: "chariow", connection_status: "connected" },
];
let currentState: WizardState;
let patch: ReturnType<typeof vi.fn>;
let onNext: ReturnType<typeof vi.fn>;
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function response(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
}
function render() {
  act(() => root.render(<Step1Product state={currentState} patch={patch} onNext={onNext} />));
}
async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
async function chooseStore(id: string) {
  const select = container.querySelector("#campaign-store") as HTMLSelectElement;
  act(() => {
    Object.defineProperty(select, "value", { configurable: true, value: id });
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  currentState = { ...currentState, storeId: id, product: null, destinationUrl: "" };
  render();
  await flush();
}

beforeEach(() => {
  locale = "fr";
  currentState = { ...DEFAULT_WIZARD_STATE, storeId: "store-a" };
  patch = vi.fn((delta: Partial<WizardState>) => { currentState = { ...currentState, ...delta }; });
  onNext = vi.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/stores") return response({ stores });
    if (url.includes("store-b")) return response({ snapshot: { products: [products.otherStore] } });
    return response({ snapshot: { products: [products.first, products.second] } });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Step1Product rendered product selection", () => {
  it.each(["fr", "en"] as const)("patches destination URL on product and store changes (%s)", async (language) => {
    locale = language;
    render();
    await flush();
    expect(container.textContent).toContain(language === "fr" ? "Choisissez un produit" : "Choose a product");

    const firstButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Produit Alpha"))!;
    act(() => firstButton.click());
    expect(patch).toHaveBeenLastCalledWith({ product: products.first, destinationUrl: products.first.url });
    render();
    const secondButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Produit Beta"))!;
    act(() => secondButton.click());
    expect(patch).toHaveBeenLastCalledWith({ product: products.second, destinationUrl: products.second.url });

    await chooseStore("store-b");
    expect(patch).toHaveBeenCalledWith({ storeId: "store-b", product: null, destinationUrl: "" });
    const storeBProduct = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Produit Gamma"))!;
    act(() => storeBProduct.click());
    expect(patch).toHaveBeenLastCalledWith({ product: products.otherStore, destinationUrl: products.otherStore.url });
    expect(container.querySelector("#campaign-store")?.textContent).toContain("Boutique B");
  });

  it("does not allow selecting a previous store catalog while the next catalog is pending", async () => {
    let resolveCatalog!: (value: unknown) => void;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/stores") return response({ stores });
      if (url.includes("store-b")) return new Promise((resolve) => { resolveCatalog = resolve; });
      return response({ snapshot: { products: [products.first, products.second] } });
    });
    render();
    await flush();
    const select = container.querySelector("#campaign-store") as HTMLSelectElement;
    act(() => {
      select.value = "store-b";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    currentState = { ...currentState, storeId: "store-b", product: null, destinationUrl: "" };
    render();
    const staleProduct = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Produit Alpha"));
    expect(staleProduct).toBeUndefined();
    expect(patch).toHaveBeenCalledWith({ storeId: "store-b", product: null, destinationUrl: "" });
    await act(async () => { resolveCatalog({ ok: true, json: () => Promise.resolve({ snapshot: { products: [products.otherStore] } }) }); });
    await flush();
    expect(Array.from(container.querySelectorAll("button")).some((button) => button.textContent?.includes("Produit Gamma"))).toBe(true);
  });
});
