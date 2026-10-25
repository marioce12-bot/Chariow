// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePerformanceRecommendationBadges } from "./usePerformanceRecommendationBadges";
import { buildCampaignRecommendations, campaignRecommendationFingerprint, selectStrongestCampaignRecommendation } from "./campaign-recommendations";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const measuredPerformance = {
  period: { from: "2026-09-25", to: "2026-10-24" },
  visualRecommendations: [{ productId: "product-1", productName: "Carnet", campaignId: "campaign-1", platform: "meta", signature: "visual-only-signal" }],
  productEligibility: [{ productId: "product-1", productName: "Carnet", launchedCampaigns: 1, analyzedCampaigns: 1, eligible: true }],
  campaigns: [{
    campaignId: "campaign-1", name: "Measured campaign", platform: "meta", status: "active", productId: "product-1", productName: "Carnet",
    launched: true, analyzed: true,
    metrics: { scope: "campaign", currency: "USD", spend: 100, clicks: 200, impressions: 4000, attributedOrders: 5, attributedRevenue: 250, attributedCurrency: "USD" },
  }],
};
const campaignRecords = [{
  id: "campaign-1", product_id: "product-1", product_name: "Carnet", platform: "meta", title: "Carnet", ad_text: "Découvrir le carnet",
  daily_budget: 5, duration_days: 5, status: "active", updated_at: "2026-10-24T00:00:00.000Z",
}];
const campaignRecommendation = selectStrongestCampaignRecommendation(buildCampaignRecommendations(measuredPerformance as any, campaignRecords as any).values())!;
const campaignSignature = campaignRecommendationFingerprint(campaignRecommendation, measuredPerformance.period as any);
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

function Harness({ activeSection }: { activeSection: string }) {
  const badges = usePerformanceRecommendationBadges({ userId: "user-1", storeId: "store-1", activeSection });
  return <div>
    <span id="recommendation-badge" data-unseen={badges.hasNewRecommendation} />
    <button type="button" id="view-recommendation" onClick={() => badges.reportRecommendation("campaign", "store-1", campaignSignature)}>Consulter les recommandations</button>
  </div>;
}

beforeEach(() => {
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/creative-performance?")) return new Response(JSON.stringify(measuredPerformance), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url.startsWith("/api/ad-campaigns?")) return new Response(JSON.stringify({ campaigns: campaignRecords }), { status: 200, headers: { "Content-Type": "application/json" } });
    throw new Error(`Unexpected fetch ${url} ${init?.method ?? "GET"}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("recommendation badge", () => {
  it("keeps only the public-ad recommendation signal and clears it after the destination is viewed", async () => {
    await act(async () => {
      root.render(<Harness activeSection="Vue d'ensemble" />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector("#recommendation-badge")?.getAttribute("data-unseen")).toBe("true");
    expect(container.querySelector("#visual-badge")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("read_only=1"))).toBe(true);
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => /ideas|studio\/image|ad-campaigns\/.*launch/.test(String(url)))).toBe(false);

    await act(async () => root.render(<Harness activeSection="Performance publicitaire" />));
    await act(async () => container.querySelector<HTMLButtonElement>("#view-recommendation")!.click());
    await act(async () => root.render(<Harness activeSection="Vue d'ensemble" />));
    expect(container.querySelector("#recommendation-badge")?.getAttribute("data-unseen")).toBe("false");
  });
});
