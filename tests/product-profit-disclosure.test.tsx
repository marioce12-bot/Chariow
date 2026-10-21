// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import ProductProfitPanel from "@/components/dashboard/ProductProfitPanel";
import { I18nProvider } from "@/lib/i18n/i18n";

let host: HTMLDivElement;
let root: Root;

async function mount(products: unknown[]) {
  Object.defineProperty(navigator, "language", { configurable: true, value: "fr" });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes("/api/product-profit")
        ? { products, costs: [] }
        : { campaigns: [], reasons: [] },
    })),
  );
  await act(async () => {
    root.render(createElement(I18nProvider, null, createElement(ProductProfitPanel, { storeId: "store-1" })));
  });
  await act(async () => Promise.resolve());
}

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const base = {
  productId: "product-public-1",
  productName: "Ebook",
  currency: "XOF",
  units: 1,
  grossRevenue: 1200,
  netRevenue: 1019.15,
  chariowFees: 180.85,
  estimatedNetRevenue: false,
  chariowFeeRate: 0.15 as const,
  profit: null as number | null,
  marginPercent: null as number | null,
  metaPurchases: null as number | null,
  metaPurchaseValue: null as number | null,
};

function detailsAreClosed() {
  const details = [...host.querySelectorAll("details")];
  expect(details.length).toBeGreaterThan(0);
  expect(details.every((element) => !element.open)).toBe(true);
}

describe("ProductProfitPanel disclosure des raisons de rentabilité", () => {
  it.each([
    "Dépenses quotidiennes incomplètes pour campagne 120209876543.",
    "Aucune donnée quotidienne pour campagne 120209876543.",
    "Couverture/synchronisation Meta incomplète ou périmée pour compte act_998877665544.",
    "Dépenses Meta incomplètes pour campagne 120209876543, compte act_998877665544 : ERROR fetch /api/meta 500",
  ])("présente une raison quotidienne sûre sans identifiants ni logs : %s", async (reason) => {
    const product = {
      ...base,
      adSpendStatus: "incomplete",
      adSpend: null,
      adSpendByCurrency: [{ currency: "XOF", amount: null }],
      adSpendReasons: [reason],
    };
    await mount([product]);

    const html = host.innerHTML;
    expect(html).not.toMatch(/120209876543|998877665544|act_998877665544|ERROR fetch|\/api\/meta/);
    expect(host.textContent).not.toContain("500");
    expect(host.textContent).toContain("Indisponible");
    expect(host.textContent).toContain("Dépenses Meta incomplètes");
    expect(host.textContent).toContain("Montant net après frais");
    detailsAreClosed();
    const summary = host.querySelector(".profit-summary")!;
    const productCard = host.querySelector(".profit-product")!;
    expect(summary.textContent).toContain("Indisponible");
    expect(productCard.textContent).toContain("Indisponible");
    expect(productCard.textContent).toContain("Dépenses Meta incomplètes");
  });

  it("explique une incompatibilité de devises avec une raison sûre et garde le net", async () => {
    await mount([{
      ...base,
      adSpendStatus: "incompatible_currency",
      adSpend: null,
      adSpendByCurrency: [{ currency: "USD", amount: 200 }],
      adSpendReasons: ["Devises non comparables : serveur indique devise cible USD, debug trace_id=private-currency-777"],
    }]);

    expect(host.innerHTML).not.toMatch(/private-currency-777|trace_id|debug/);
    expect(host.textContent).toContain("Indisponible");
    expect(host.textContent).toContain("Devises non comparables");
    expect(host.textContent).toContain("Montant net après frais");
    expect(host.textContent).toContain("USD");
    detailsAreClosed();
  });

  it("affiche le bénéfice complet en montant estimé et sépare les métriques Meta agrégées des commandes", async () => {
    await mount([{
      ...base,
      productName: "Produit complet",
      currency: "XOF",
      netRevenue: 1019.15,
      adSpendStatus: "complete",
      adSpend: 200,
      adSpendByCurrency: [{ currency: "XOF", amount: 200 }],
      profit: 819.15,
      marginPercent: 80.4,
      linkedCampaignCount: 2,
      campaigns: [],
      provenance: { paidSales: 3, refundCount: 0, campaignLinkedSales: 0, reliability: "complete" },
      metaPurchases: 7,
      metaPurchaseValue: 1400,
      metaCurrency: "XOF",
    }]);

    expect(host.textContent).toContain("819,15");
    expect(host.textContent).toContain("Montant net reçu");
    expect(host.textContent).toContain("Commandes payées Chariow");
    expect(host.textContent).toContain("Conversions d’achats Meta (agrégées)");
    expect(host.textContent).toContain("ne prouvent pas les commandes Chariow une par une");
    expect(host.textContent).toContain("Aucune métadonnée de campagne individuelle sur ces commandes");
    expect(host.textContent).toContain("Cela ne remet pas en cause les campagnes associées au produit");
    detailsAreClosed();
  });

  it("ne révèle pas les identifiants privés lorsque la campagne et le produit n'ont pas de nom", async () => {
    await mount([{
      ...base,
      productId: "product-private-445566",
      productName: null,
      campaigns: [{ id: "campaign-private-778899", name: null, sales: 1 }],
      adSpendStatus: "incomplete",
      adSpendByCurrency: [{ currency: "XOF", amount: null }],
      adSpendReasons: ["Calcul incomplet pour campaign-private-778899; server_log=secret-123"],
    }]);

    expect(host.innerHTML).not.toMatch(/product-private-445566|campaign-private-778899|secret-123|server_log/);
    expect(host.textContent.toLowerCase()).toContain("commande");
    expect(host.textContent).toContain("Indisponible");
    detailsAreClosed();
  });
});
