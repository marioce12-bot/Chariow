// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { AdVariantPackResults } from "@/components/vendeo/AdVariantPackResults";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr" }) }));
const pack = { id: "pack-new", status: "ambiguous", product_name: "Produit test", external_campaign_id: "meta-campaign", checkpoints: { campaignId: "meta-campaign", adsets: ["set-1", null, null] }, variants: [{ id: "v1", angle: "Angle un", format: "image" }, { id: "v2", angle: "Angle deux", format: "video" }, { id: "v3", angle: "Angle trois", format: "carousel" }] };
describe("AdVariantPackResults", () => {
  afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); localStorage.clear(); });
  it("affiche un pack serveur partiel sans action ni statut de diffusion affirmé", async () => {
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
    expect(host.textContent).toContain("Résultats par ensemble indisponibles");
    expect(host.textContent).not.toContain("Active");
    expect(host.querySelector("button")).toBeNull();
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
