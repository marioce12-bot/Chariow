// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PerformanceVisuelView } from "./PerformanceVisuelView";

afterEach(() => vi.unstubAllGlobals());

describe("PerformanceVisuelView report rendering", () => {
  it("loads the report response and displays the real ad-level spend, clicks and campaign", async () => {
    const body = {
      period: { from: "2026-09-25", to: "2026-10-24" },
      metrics: { mediaCount: 1, campaigns: 1, launchedCampaigns: 1, unavailableCampaignMetrics: 0,
        totals: [{ currency: "USD", spend: 99, clicks: 90, attributedOrders: null, costPerOrder: null, attributedRevenue: null, campaigns: 1, complete: true }] },
      media: [{
        id: "asset-1", kind: "image", url: "https://media.example/image.jpg", sha256: "a".repeat(64), createdAt: "2026-10-01T00:00:00.000Z",
        spend: 12.5, currency: "USD", spendByCurrency: [{ currency: "USD", amount: 12.5 }], clicks: 18,
        attributedOrders: null, attributedRevenue: null, attributedCurrency: null, costPerOrder: null, winner: false, metricsComplete: true,
        campaigns: [{ id: "placement-1", campaignId: "campaign-1", campaignName: "Campagne TikTok mesurée", platform: "tiktok", status: "active",
          productId: null, productName: null, variantLabel: null, isMultiMedia: false,
          metrics: { available: true, scope: "ad", currency: "USD", spend: 12.5, impressions: 240, clicks: 18, platformConversions: 2,
            attributedOrders: null, attributedRevenue: null, attributedCurrency: null, attributionReliable: false } }],
      }],
      campaigns: [{ campaignId: "campaign-1", name: "Campagne TikTok mesurée", platform: "tiktok", status: "active", productId: null,
        productName: null, launched: true, analyzed: true, metrics: { currency: "USD", spend: 99, clicks: 90, impressions: 900,
          attributedOrders: null, attributedRevenue: null, attributedCurrency: null } }],
      productEligibility: [], duplicateCandidates: [], notices: { tikTok: null, pinterest: null },
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(<PerformanceVisuelView storeId="store-1" onOpenStudio={vi.fn()} readOnly />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/creative-performance?store_id=store-1&days=30", { cache: "no-store" });
    expect(container.textContent).toContain("Campagne TikTok mesurée");
    expect(container.textContent).toContain("99,00");
    expect(container.textContent).toContain("12,50");
    expect(container.textContent).toContain("18");
    expect(container.querySelector(".creative-media-card")?.textContent).not.toContain("99,00");
    expect(container.querySelector(".creative-variant-editor")).toBeNull();
    expect(container.querySelector(".creative-studio-actions")).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });
});
