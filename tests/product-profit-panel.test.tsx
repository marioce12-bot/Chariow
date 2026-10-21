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
    { netRevenue: 1019.15, expected: "Indisponible" },
    { netRevenue: null, expected: "incomplètes" },
  ])("keeps net after fees separate when profit is unknown ($netRevenue)", async ({ netRevenue, expected }) => {
    const product = { productId: "p", productName: "Ebook", currency: "XOF", units: 1, grossRevenue: 1199, netRevenue, chariowFees: 179.85, estimatedNetRevenue: false, chariowFeeRate: 0.15, profit: null, marginPercent: null, adSpendStatus: "unavailable", adSpendReasons: ["Période invalide"] };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/api/product-profit") ? { products: [product], costs: [] } : { campaigns: [], reasons: [] } })));
    await mount("store-1");
    await act(async () => Promise.resolve());
    expect(host.textContent).toContain(expected);
    expect(host.textContent).not.toContain("Bénéfice réel indisponible");
    expect(host.textContent).not.toContain("Vendeo ne sait pas encore quelles dépenses");
    if (netRevenue != null) expect(host.textContent).toContain("Montant net après frais");
  });

  it("separates Meta aggregates from Chariow orders and shows unallocated campaign spend", async () => {
    const product = { productId: "p", productName: "Ebook", currency: "XOF", units: 4, grossRevenue: 1199, netRevenue: 1019.15, chariowFees: 179.85, estimatedNetRevenue: false, chariowFeeRate: 0.15, profit: null, marginPercent: null, campaigns: [{ id: "ch-1", name: "Chariow", sales: 2 }], adSpendStatus: "ambiguous", adSpendByCurrency: [{ currency: "EUR", amount: null }], metaPurchases: null, metaPurchaseValue: null };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/api/product-profit") ? { products: [product], costs: [] } : { campaigns: [], reasons: [] } })));
    await mount("store-1");
    await act(async () => Promise.resolve());
    expect(host.textContent).toContain("Non alloué");
    expect(host.textContent).toContain("Indisponible");
    expect(host.textContent).toContain("Commandes payées Chariow");
    expect(host.textContent).toContain("Conversions d’achats Meta (agrégées)");
    expect(host.textContent).toContain("ne prouvent pas les commandes Chariow une par une");
    expect(host.textContent).toContain("XOF");
    expect(host.textContent).toContain("EUR");
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
  it("never turns unavailable Meta purchases into zero or a partial net into a complete total", async () => {
    const base = { productId: "p", productName: "Ebook", currency: "USD", units: 1, grossRevenue: 100, netRevenue: 85, chariowFees: 15, estimatedNetRevenue: false, chariowFeeRate: 0.15, profit: null, marginPercent: null,
      metaPurchases: null, metaConversionsByCurrency: [{ currency: "USD", purchases: null, value: null }],
      provenance: { paidSales: 1, refundCount: 0, campaignLinkedSales: 1, reliability: "complete" } };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes("/api/product-profit") ? { products: [base, { ...base, productId: "q", netRevenue: null }], costs: [] } : { campaigns: [], reasons: [] } })));
    await mount("store-1"); await act(async () => Promise.resolve());
    expect(host.querySelector(".profit-summary .profit-summary-metrics strong")?.textContent).toBe("Indisponible");
    expect(host.querySelector(".profit-product")?.textContent).toContain("Conversions d’achats Meta (agrégées) Indisponible");
    expect(host.textContent).toContain("Commandes avec métadonnées de campagne individuelles 1");
  });

});
