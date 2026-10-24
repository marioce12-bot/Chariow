// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ uploadCampaignMedia: vi.fn() }));
vi.mock("@/lib/media/direct-upload", () => ({ uploadCampaignMedia: mocks.uploadCampaignMedia }));
import { CampaignPerformanceTab } from "./CampaignPerformanceTab";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let onApplyCampaign: ReturnType<typeof vi.fn>;

const referenceCampaign = {
  id: "campaign-1", product_id: "product-1", product_name: "Carnet créatif", platform: "meta", objective: "sales",
  ad_set_name: "Ensemble BJ", ad_name: "Annonce 1", title: "Le carnet qui inspire", ad_text: "Découvrez le carnet.",
  media_url: null, carousel_urls: [], destination_url: "https://shop.example/product", countries: ["BJ"],
  geo_targeting: { countries: ["BJ"], regions: [], cities: [] }, min_age: 18, max_age: 45,
  daily_budget: 5, duration_days: 5, meta_ad_account_id: "account-1", meta_page_id: "page-1",
};
const secondaryCampaign = {
  ...referenceCampaign, id: "campaign-2", product_id: "product-2", product_name: "Aquarelle",
  title: "Aquarelle créative", ad_text: "Présentation du produit.", daily_budget: 8,
};
const performanceData = {
  period: { from: "2026-09-25", to: "2026-10-24" },
  metrics: { mediaCount: 1, campaigns: 1, launchedCampaigns: 1, unavailableCampaignMetrics: 0, totals: [] },
  media: [], duplicateCandidates: [], notices: {},
  campaigns: [{ campaignId: "campaign-1", name: "Campagne historique", platform: "meta", status: "active", productId: "product-1", productName: "Carnet créatif", launched: true, analyzed: true,
    metrics: { currency: "USD", spend: 100, clicks: 200, impressions: 4000, attributedOrders: 5, attributedRevenue: 250, attributedCurrency: "USD" } }],
  productEligibility: [{ productId: "product-1", productName: "Carnet créatif", launchedCampaigns: 1, analyzedCampaigns: 1, eligible: true }],
};
const performanceDataWithTwoEligibleProducts = {
  ...performanceData,
  metrics: { ...performanceData.metrics, campaigns: 2, launchedCampaigns: 2 },
  campaigns: [...performanceData.campaigns, {
    campaignId: "campaign-2", name: "Campagne historique Aquarelle", platform: "meta", status: "active", productId: "product-2", productName: "Aquarelle", launched: true, analyzed: true,
    metrics: { currency: "USD", spend: 100, clicks: 250, impressions: 5000, attributedOrders: 8, attributedRevenue: 400, attributedCurrency: "USD" },
  }],
  productEligibility: [...performanceData.productEligibility, { productId: "product-2", productName: "Aquarelle", launchedCampaigns: 1, analyzedCampaigns: 1, eligible: true }],
};
const noReliablePerformanceData = {
  ...performanceData,
  campaigns: [],
  productEligibility: [{ productId: "product-1", productName: "Carnet créatif", launchedCampaigns: 1, analyzedCampaigns: 0, eligible: false }],
};
const product = { id: "product-1", name: "Carnet créatif", description: "Un carnet illustré.", price: 12, currency: "USD", status: "published", image: null, createdAt: null, sales: 5 };
const otherProduct = { id: "product-2", name: "Aquarelle", description: "Un produit sans résultats vérifiés.", price: 10, currency: "USD", status: "published", image: null, createdAt: null, sales: 0 };

function button(label: string) {
  const found = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(label));
  if (!found) throw new Error(`Missing button: ${label}`);
  return found as HTMLButtonElement;
}

function automaticProductName() {
  const label = Array.from(container.querySelectorAll(".ad-config-grid dt")).find((item) => item.textContent === "Produit retenu automatiquement");
  return label?.nextElementSibling?.textContent ?? null;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onApplyCampaign = vi.fn();
  mocks.uploadCampaignMedia.mockReset();
  mocks.uploadCampaignMedia.mockRejectedValueOnce(new Error("temporary upload issue")).mockResolvedValue({ secure_url: "https://cloudinary.example/generated.png" });
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/ad-campaigns?store_id=store-1") return jsonResponse({ campaigns: [referenceCampaign, secondaryCampaign] });
    if (url.startsWith("/api/ad-performance/geography")) return jsonResponse({ period: performanceData.period, visitsByLocation: [], salesByCountry: [], conversionByCountry: [] });
    if (url.startsWith("/api/creative-performance/ideas")) return jsonResponse({ eligible: true, source: { storeId: "store-1", productId: "product-1", campaignId: "campaign-1", period: performanceData.period, evidence: { attributedOrders: 5, attributedRevenue: 250 } }, ideas: [{ id: "image-idea", format: "image", title: "Image test", prompt: "Créer une image produit." }] });
    if (url === "/api/studio/image") return jsonResponse({ imageUrl: "https://studio.example/image.png", cost: 20, generationId: "generation-1" });
    if (url === "https://studio.example/image.png") return new Response(new Blob(["image-bytes"], { type: "image/png" }), { headers: { "Content-Type": "image/png" } });
    throw new Error(`Unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("CampaignPerformanceTab recommendation flow", () => {
  it("auto-selects the only eligible product and acts only after an explicit apply", async () => {
    await act(async () => {
      root.render(<CampaignPerformanceTab storeId="store-1" periodDays="30" data={performanceData as any} loading={false} products={[otherProduct, product]} readOnly={false} onApplyCampaign={onApplyCampaign} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector(".ad-inline-product-select")).toBeNull();
    expect(automaticProductName()).toBe("Carnet créatif");
    expect(container.textContent).toContain("Recommandation de campagne");
    expect(container.textContent).toContain("Meta Ads");
    expect(container.textContent).toContain("Non recommandé : aucune attribution géographique fiable");
    expect(container.textContent).toContain("Image HD verticale · 9:16 (proposée)");
    expect(container.textContent).toContain("Le titre, le texte, le budget et la durée proviennent du réglage de la campagne source");
    expect(container.textContent).toContain("Appliquer · 20 crédits");
    expect(container.textContent).not.toContain("Campagne historique");
    expect(container.textContent).not.toContain("ROAS");
    expect(container.textContent).not.toContain("Visites");
    expect(container.textContent).not.toContain("55 900");
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/creative-performance/ideas"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/studio/image")).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/ad-performance/geography"))).toBe(false);
    expect(mocks.uploadCampaignMedia).not.toHaveBeenCalled();

    await act(async () => { button("Appliquer · 20 crédits").click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/creative-performance/ideas"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/studio/image")).toHaveLength(1);
    const generationRequest = fetchMock.mock.calls.find(([url]) => String(url) === "/api/studio/image")?.[1] as RequestInit;
    expect(JSON.parse(generationRequest.body as string)).toMatchObject({ quality: "medium", resolution: "hd", orientation: "portrait" });
    expect(container.textContent).toContain("temporary upload issue");
    expect(mocks.uploadCampaignMedia).toHaveBeenCalledOnce();
    expect(onApplyCampaign).not.toHaveBeenCalled();
    expect(container.textContent).toContain("L’image est prête. Réessaie l’import sans la générer à nouveau.");

    await act(async () => { button("Réessayer l’import").click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/studio/image")).toHaveLength(1);
    expect(mocks.uploadCampaignMedia).toHaveBeenCalledTimes(2);
    expect(onApplyCampaign).toHaveBeenCalledOnce();
    expect(onApplyCampaign).toHaveBeenCalledWith(expect.objectContaining({
      id: "campaign-1", product_id: "product-1", product_name: "Carnet créatif", media_url: "https://cloudinary.example/generated.png",
      destination_url: "https://shop.example/product", countries: ["BJ"], daily_budget: 5, duration_days: 5,
      geographyRecommendationUnavailable: true,
    }));
    expect(container.textContent).toContain("Image générée · brouillon prêt");
    expect(container.querySelector<HTMLImageElement>(".ad-visual-frame img")?.src).toBe("https://studio.example/image.png");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/ad-campaigns/campaign-1/launch"))).toBe(false);
  });

  it("automatically chooses the strongest eligible product by measured ROAS", async () => {
    await act(async () => {
      root.render(<CampaignPerformanceTab storeId="store-1" periodDays="30" data={performanceDataWithTwoEligibleProducts as any} loading={false} products={[product, otherProduct]} readOnly={false} onApplyCampaign={onApplyCampaign} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector(".ad-inline-product-select")).toBeNull();
    expect(automaticProductName()).toBe("Aquarelle");
    expect(container.textContent).not.toContain("Carnet créatif");
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/studio/image")).toBe(false);
    expect(onApplyCampaign).not.toHaveBeenCalled();
  });

  it("shows a short empty state when no product has reliable measured results", async () => {
    await act(async () => {
      root.render(<CampaignPerformanceTab storeId="store-1" periodDays="30" data={noReliablePerformanceData as any} loading={false} products={[otherProduct, product]} readOnly={false} onApplyCampaign={onApplyCampaign} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("Aucune recommandation fiable pour le moment.");
    expect(container.textContent).not.toContain("RECOMMANDATION FONDÉE SUR DES DONNÉES MESURÉES");
    expect(container.textContent).not.toContain("Pas encore de proposition pour ce produit");
    expect(container.querySelector(".ad-inline-product-select")).toBeNull();
    expect(container.querySelector(".ad-apply-button")).toBeNull();
    expect(container.querySelector(".ad-launch-button")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/studio/image")).toBe(false);
    expect(onApplyCampaign).not.toHaveBeenCalled();
  });
});
