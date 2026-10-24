// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PerformanceVisuelView } from "./PerformanceVisuelView";

afterEach(() => vi.unstubAllGlobals());

describe("PerformanceVisuelView report rendering", () => {
  it("shows one aggregated media card when a visual is reused across campaigns", async () => {
    const body = {
      period: { from: "2026-09-25", to: "2026-10-24" },
      metrics: { mediaCount: 1, campaigns: 1, launchedCampaigns: 1, unavailableCampaignMetrics: 0,
        totals: [{ currency: "USD", spend: 99, clicks: 90, attributedOrders: null, costPerOrder: null, attributedRevenue: null, campaigns: 1, complete: true }] },
      media: [{
        id: "asset-1", kind: "image", url: "https://media.example/image.jpg", sha256: "a".repeat(64), createdAt: "2026-10-01T00:00:00.000Z",
        spend: 21, currency: "USD", spendByCurrency: [{ currency: "USD", amount: 21 }], clicks: 23,
        attributedOrders: null, attributedRevenue: null, attributedCurrency: null, costPerOrder: null, winner: false, metricsComplete: true,
        campaigns: [
          { id: "placement-1", campaignId: "campaign-1", campaignName: "Campagne TikTok mesurée", platform: "tiktok", status: "active",
            productId: null, productName: null, variantLabel: null, isMultiMedia: false,
            metrics: { available: true, scope: "ad", currency: "USD", spend: 12.5, impressions: 240, clicks: 18, platformConversions: 2,
              attributedOrders: null, attributedRevenue: null, attributedCurrency: null, attributionReliable: false } },
          { id: "placement-2", campaignId: "campaign-2", campaignName: "Campagne Meta mesurée", platform: "meta", status: "active",
            productId: null, productName: null, variantLabel: null, isMultiMedia: false,
            metrics: { available: true, scope: "ad", currency: "USD", spend: 8.5, impressions: 160, clicks: 5, platformConversions: 1,
              attributedOrders: null, attributedRevenue: null, attributedCurrency: null, attributionReliable: false } },
        ],
      }],
      campaigns: [
        { campaignId: "campaign-1", name: "Campagne TikTok mesurée", platform: "tiktok", status: "active", productId: null,
          productName: null, launched: true, analyzed: true, metrics: { currency: "USD", spend: 99, clicks: 90, impressions: 900,
            attributedOrders: null, attributedRevenue: null, attributedCurrency: null } },
        { campaignId: "campaign-2", name: "Campagne Meta mesurée", platform: "meta", status: "active", productId: null,
          productName: null, launched: true, analyzed: true, metrics: { currency: "USD", spend: 44, clicks: 40, impressions: 500,
            attributedOrders: null, attributedRevenue: null, attributedCurrency: null } },
      ],
      productEligibility: [], duplicateCandidates: [], notices: { tikTok: null, pinterest: null },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.startsWith("/api/creative-performance?") ? body
        : url === "/api/ad-campaigns" ? { campaigns: [] }
          : url.startsWith("/api/ad-performance/geography") ? { visitsByLocation: [], salesByCountry: [], conversionByCountry: [] }
            : {};
      return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<PerformanceVisuelView storeId="store-1" onOpenStudio={vi.fn()} readOnly />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const visualsTab = Array.from(container.querySelectorAll('[role="tab"]')).find((tab) => tab.textContent === "Visuels");
    await act(async () => { visualsTab?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

    expect(fetchMock).toHaveBeenCalledWith("/api/creative-performance?store_id=store-1&days=30", { cache: "no-store" });
    expect(container.textContent).toContain("Résultats par visuel");
    expect(container.textContent).toContain("99,00");
    expect(container.querySelectorAll(".creative-media-card")).toHaveLength(1);
    expect(container.querySelector(".creative-media-card")?.textContent).toContain("21,00");
    expect(container.querySelector(".creative-media-card")?.textContent).toContain("23");
    expect(container.querySelector(".creative-campaign-details")?.hasAttribute("open")).toBe(false);
    expect(container.querySelector(".creative-campaign-details summary")?.textContent).toContain("2 campagne(s)");
    expect(container.querySelector(".creative-media-card")?.textContent).not.toContain("99,00");
    expect(container.querySelector(".creative-ready-products")).toBeNull();
    expect(container.querySelector(".creative-all-campaigns")).toBeNull();
    expect(container.querySelector(".creative-variant-editor")).toBeNull();
    expect(container.querySelector(".creative-studio-actions")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/ad-performance/geography"))).toBe(true);

    await act(async () => root.unmount());
  });
});
