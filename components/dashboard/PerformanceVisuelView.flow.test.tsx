// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PerformanceVisuelView } from "./PerformanceVisuelView";

afterEach(() => vi.unstubAllGlobals());

describe("PerformanceVisuelView visual comparison", () => {
  it("renders one aggregated visual card without exposing campaign or visit lists", async () => {
    const body = {
      period: { from: "2026-09-25", to: "2026-10-24" },
      metrics: { mediaCount: 1, campaigns: 2, launchedCampaigns: 2, unavailableCampaignMetrics: 0,
        totals: [{ currency: "USD", spend: 99, clicks: 90, attributedOrders: null, costPerOrder: null, attributedRevenue: null, campaigns: 2, complete: true }] },
      media: [{
        id: "asset-1", kind: "image", url: "https://media.example/image.jpg", sha256: "a".repeat(64), createdAt: "2026-10-01T00:00:00.000Z",
        spend: 21, currency: "USD", spendByCurrency: [{ currency: "USD", amount: 21 }], clicks: 23,
        attributedOrders: null, attributedRevenue: null, attributedCurrency: null, costPerOrder: null, winner: false, metricsComplete: true,
        campaigns: [
          { id: "placement-1", campaignId: "campaign-1", campaignName: "Private campaign name 1", platform: "tiktok", status: "active",
            productId: null, productName: null, variantLabel: null, isMultiMedia: false,
            metrics: { available: true, scope: "ad", currency: "USD", spend: 12.5, impressions: 240, clicks: 18, platformConversions: 2,
              attributedOrders: null, attributedRevenue: null, attributedCurrency: null, attributionReliable: false } },
          { id: "placement-2", campaignId: "campaign-2", campaignName: "Private campaign name 2", platform: "meta", status: "active",
            productId: null, productName: null, variantLabel: null, isMultiMedia: false,
            metrics: { available: true, scope: "ad", currency: "USD", spend: 8.5, impressions: 160, clicks: 5, platformConversions: 1,
              attributedOrders: null, attributedRevenue: null, attributedCurrency: null, attributionReliable: false } },
        ],
      }],
      campaigns: [
        { campaignId: "campaign-1", name: "Private campaign name 1", platform: "tiktok", status: "active", productId: null,
          productName: null, launched: true, analyzed: true, metrics: { currency: "USD", spend: 99, clicks: 90, impressions: 900,
            attributedOrders: null, attributedRevenue: null, attributedCurrency: null } },
        { campaignId: "campaign-2", name: "Private campaign name 2", platform: "meta", status: "active", productId: null,
          productName: null, launched: true, analyzed: true, metrics: { currency: "USD", spend: 44, clicks: 40, impressions: 500,
            attributedOrders: null, attributedRevenue: null, attributedCurrency: null } },
      ],
      productEligibility: [], duplicateCandidates: [], notices: { tikTok: null, pinterest: null },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/creative-performance?")) return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<PerformanceVisuelView storeId="store-1" />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/creative-performance?store_id=store-1&days=30", { cache: "no-store" });
    expect(container.textContent).toContain("Comparer les visuels");
    expect(container.querySelectorAll(".creative-media-card")).toHaveLength(1);
    const visual = container.querySelector(".creative-media-card")?.textContent ?? "";
    expect(visual).toContain("21,00");
    expect(visual).toContain("23");
    expect(visual).not.toContain("Private campaign name");
    expect(container.textContent).not.toContain("Private campaign name");
    expect(container.textContent).not.toContain("Visites");
    expect(container.querySelector(".creative-campaign-details")).toBeNull();
    expect(container.querySelector(".creative-variant-summary")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/ad-campaigns"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/ad-performance/geography"))).toBe(false);

    await act(async () => root.unmount());
  });
});
