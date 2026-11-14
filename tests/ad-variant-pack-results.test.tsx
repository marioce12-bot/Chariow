// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { AdVariantPackResults } from "@/components/vendeo/AdVariantPackResults";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr" }) }));
const pack = {
  id: "pack-new", status: "ambiguous", product_name: "Produit test", external_campaign_id: "meta-campaign",
  checkpoints: { campaignId: "meta-campaign", adsets: ["set-1"], ads: ["ad-1", null, "ad-3"] },
  variants: [{ id: "v1", angle: "Angle un", format: "image" }, { id: "v2", angle: "Angle deux", format: "video" }, { id: "v3", angle: "Angle trois", format: "carousel" }],
  ad_results: [
    { variant_id: "v1", ad_id: "ad-1", ad_name: "Angle un", status: "ready", impressions: 1250, clicks: 35, spend: 3.5, purchases: 5, purchase_value: 25 },
    { variant_id: "v2", ad_id: null, ad_name: null, status: "not_created", impressions: null, clicks: null, spend: null, purchases: null, purchase_value: null },
    { variant_id: "v3", ad_id: "ad-3", ad_name: null, status: "awaiting_sync", impressions: null, clicks: null, spend: null, purchases: null, purchase_value: null },
  ],
  results_currency: "USD", results_period: { from: "2026-11-01", to: "2026-11-14" }, results_synced_at: "2026-11-14T02:55:00.000Z",
};
describe("AdVariantPackResults", () => {
  afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); localStorage.clear(); });
  it("affiche les Insights Meta par publicité sans inventer une diffusion ni proposer une action", async () => {
    localStorage.setItem("vendeo_ad_variant_packs_v1", "[]");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/ad-variant-packs?")) return new Response(JSON.stringify({ packs: [pack] }), { status: 200 });
      if (url.startsWith("/api/ad-campaigns?")) return new Response(JSON.stringify({ campaigns: [] }), { status: 200 });
      return new Response(JSON.stringify({ performances: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => { root.render(<AdVariantPackResults storeId="store-1" />); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(host.textContent).toContain("Statut de diffusion inconnu");
    expect(host.textContent).toContain("État de lancement partiel ou ambigu");
    expect(host.textContent).toContain("Angle trois");
    expect(host.textContent).toContain("5 achats rapportés par Meta");
    expect(host.textContent).toContain("25,00 USD de valeur rapportée par Meta");
    expect(host.textContent).toContain("Cette publicité n’a pas été créée avant l’arrêt du Pack.");
    expect(host.textContent).toContain("Pas encore de résultats Meta synchronisés pour cette publicité.");
    expect(host.textContent).not.toContain("Active");
    expect(host.querySelector("button")).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("include_ad_results=1"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/chat/campaign-actions"))).toBe(false);
    await act(async () => root.unmount());
  });
  it("signale l’erreur de chargement des packs sans empêcher le rendu historique", async () => {
    localStorage.setItem("vendeo_ad_variant_packs_v1", JSON.stringify([{ id: "old", status: "done", storeId: "store-1", accountId: "account-1", productName: "Ancien pack", createdAt: "2026-01-01", variants: [{ id: "old-v", angle: "Angle historique", format: "image", campaignId: "campaign-1" }] }]));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => String(input).startsWith("/api/ad-variant-packs?") ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({ campaigns: [], performances: [] }), { status: 200 })));
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => { root.render(<AdVariantPackResults storeId="store-1" />); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(host.textContent).toContain("Ancien pack");
    expect(host.textContent).toContain("Les nouveaux packs n’ont pas pu être chargés");
    await act(async () => root.unmount());
  });
});
