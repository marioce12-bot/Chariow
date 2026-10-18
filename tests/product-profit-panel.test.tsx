// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import ProductProfitPanel from "@/components/dashboard/ProductProfitPanel";

let host: HTMLDivElement;
let root: Root;

async function mount(storeId: string | null) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(ProductProfitPanel, { storeId }));
  });
}

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.restoreAllMocks();
});

describe("ProductProfitPanel", () => {
  it("states that Chariow fees are 15% and a provided net is not charged twice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ products: [], costs: [] }) })),
    );
    await mount("store-1");
    await act(async () => Promise.resolve());
    expect(host.textContent).toContain("15 %");
    expect(host.textContent).toContain("sans nouvelle déduction des frais");
    expect(host.textContent).not.toMatch(/coût de fabrication|frais supplémentaires/i);
    expect(host.querySelector("input")).toBeNull();
    expect(host.querySelector("button")).toBeNull();
  });

  it.each([
    { netRevenue: 1019.15, expected: "dépenses non rapprochées de ce produit" },
    { netRevenue: null, expected: "montants de vente incomplets" },
  ])("explains why profit is unknown when net is $netRevenue", async ({ netRevenue, expected }) => {
    const product = { productId: "p", productName: "Ebook", currency: "XOF", units: 1, grossRevenue: 1199, netRevenue, chariowFees: 179.85, estimatedNetRevenue: false, chariowFeeRate: 0.15, profit: null, marginPercent: null };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/api/product-profit") ? { products: [product], costs: [] } : { campaigns: [], reasons: [] } })));
    await mount("store-1");
    await act(async () => Promise.resolve());
    expect(host.textContent).toContain(expected);
    expect(host.textContent).not.toContain("Bénéfice réel indisponible");
    if (netRevenue != null) expect(host.textContent).toContain("Cela ne signifie pas que ton pixel est mal installé.");
  });

  it("renders local skeletons while sales are loading", async () => {
    let resolveFetch!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    await mount("store-1");
    expect(host.querySelector('[aria-label="Chargement des ventes"]')).not.toBeNull();
    expect(host.querySelectorAll(".sk").length).toBeGreaterThan(0);
    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ products: [], costs: [] }) });
    });
  });
});
