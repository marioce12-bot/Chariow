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
const performanceData = {
  period: { from: "2026-09-25", to: "2026-10-24" },
  metrics: { mediaCount: 1, campaigns: 1, launchedCampaigns: 1, unavailableCampaignMetrics: 0, totals: [] },
  media: [], duplicateCandidates: [], notices: {},
  campaigns: [{ campaignId: "campaign-1", name: "Campagne historique", platform: "meta", status: "active", productId: "product-1", productName: "Carnet créatif", launched: true, analyzed: true,
    metrics: { currency: "USD", spend: 100, clicks: 200, impressions: 4000, attributedOrders: 5, attributedRevenue: 250, attributedCurrency: "USD" } }],
  productEligibility: [{ productId: "product-1", productName: "Carnet créatif", launchedCampaigns: 1, analyzedCampaigns: 1, eligible: true }],
};
const product = { id: "product-1", name: "Carnet créatif", description: "Un carnet illustré.", price: 12, currency: "USD", status: "published", image: null, createdAt: null, sales: 5 };

function button(label: string) {
  const found = Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes(label));
  if (!found) throw new Error(`Missing button: ${label}`);
  return found as HTMLButtonElement;
}
async function flush() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onApplyCampaign = vi.fn();
  mocks.uploadCampaignMedia.mockReset();
  mocks.uploadCampaignMedia.mockRejectedValueOnce(new Error("temporary upload issue")).mockResolvedValue({ secure_url: "https://cloudinary.example/generated.png" });
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/ad-campaigns?store_id=store-1") return jsonResponse({ campaigns: [referenceCampaign] });
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
  it("shows the cost first, generates once, retries media import without regenerating, and opens an editable campaign draft", async () => {
    await act(async () => {
      root.render(<CampaignPerformanceTab storeId="store-1" period={performanceData.period} periodDays="30" data={performanceData as any} loading={false} products={[product]} readOnly={false} onApplyCampaign={onApplyCampaign} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain("Appliquer · 20 crédits");
    expect(container.textContent).toContain("ROAS 2,5×");
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/creative-performance/ideas"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/studio/image")).toBe(false);
    expect(mocks.uploadCampaignMedia).not.toHaveBeenCalled();

    await act(async () => { button("Appliquer · 20 crédits").click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/creative-performance/ideas"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/studio/image")).toHaveLength(1);
    expect(container.textContent).toContain("temporary upload issue");
    expect(mocks.uploadCampaignMedia).toHaveBeenCalledOnce();
    expect(onApplyCampaign).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Image générée et conservée dans Studio.");

    await act(async () => { button("Réessayer l’import du média").click(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/studio/image")).toHaveLength(1);
    expect(mocks.uploadCampaignMedia).toHaveBeenCalledTimes(2);
    expect(onApplyCampaign).toHaveBeenCalledOnce();
    expect(onApplyCampaign).toHaveBeenCalledWith(expect.objectContaining({
      id: "campaign-1", product_id: "product-1", product_name: "Carnet créatif", media_url: "https://cloudinary.example/generated.png",
      destination_url: "https://shop.example/product", countries: ["BJ"], daily_budget: 5, duration_days: 5,
    }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/ad-campaigns/campaign-1/launch"))).toBe(false);
  });
});
