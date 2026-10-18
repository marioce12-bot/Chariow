// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import ProductProfitPanel from "@/components/dashboard/ProductProfitPanel";
import { I18nProvider } from "@/lib/i18n/i18n";

let host: HTMLDivElement;
let root: Root;

async function mount(storeId: string | null) {
  Object.defineProperty(navigator, "language", { configurable: true, value: "fr" });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(I18nProvider, null, createElement(ProductProfitPanel, { storeId })));
  });
}

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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
    expect(host.textContent).not.toContain("Vérifier le suivi");
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

  it("omits the tracking summary and still reloads profitability for the selected period", async () => {
    const fetcher = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ products: [], quality: { status: "incomplete", issues: [] }, campaigns: [], reasons: [] }) }));
    vi.stubGlobal("fetch", fetcher);
    await mount("store-1");
    await act(async () => Promise.resolve());
    expect(host.textContent).not.toContain("Suivi à vérifier");
    expect(host.querySelector(".tracking-quality-panel")).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/api/tracking-quality"))).toBe(false);
    const periodSelect = host.querySelector("select")!;
    await act(async () => {
      periodSelect.value = "7";
      periodSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => Promise.resolve());
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/api/product-profit?storeId=store-1&period=7"))).toBe(true);
  });
});
