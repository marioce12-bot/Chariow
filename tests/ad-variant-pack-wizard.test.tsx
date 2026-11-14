// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VariantPackWizard } from "@/components/vendeo/AdVariantPackWizard";
import { uploadCampaignMedia } from "@/lib/media/direct-upload";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));
vi.mock("@/lib/media/direct-upload", () => ({ uploadCampaignMedia: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const store = "11111111-1111-4111-8111-111111111111";
const account = "22222222-2222-4222-8222-222222222222";
const ids = ["a", "b", "c"];
const angles = ids.map((id) => ({ id, title: `Angle ${id}`, rationale: `Raison ${id}`, copy: `Texte ${id}` }));
const variants = Object.fromEntries(ids.map((id) => [id, { angleId: id, format: "image", media: [`https://example.com/${id}.jpg`], copy: `Texte ${id}`, callToAction: "SHOP_NOW" }]));
let node: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
const response = (data: unknown, ok = true) => Promise.resolve({ ok, json: async () => data });

function seed(step: number) {
  localStorage.setItem("vendeo_ad_variant_pack_draft_v1", JSON.stringify({
    storeId: store, productId: "product-1", metaAdAccountId: account, metaPageId: "page-1",
    objective: "traffic", locations: [{ key: "BJ", name: "Bénin", type: "country", countryCode: "BJ" }],
    minAge: 18, maxAge: 45, gender: null, interests: [], advantageAudience: false,
    dailyBudget: 7, durationDays: 20, angles, selected: ids, variants, step, started: true,
  }));
}
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
async function mount(step: number) {
  seed(step);
  await act(async () => { root.render(<VariantPackWizard storeId={store} onClose={vi.fn()} onLaunched={vi.fn()} />); });
  await settle();
}
function button(text: string): HTMLButtonElement {
  const item = [...document.querySelectorAll("button")].find((el) => el.textContent?.includes(text));
  if (!item) throw new Error(`Bouton absent : ${text}`);
  return item;
}

beforeEach(() => {
  localStorage.clear();
  node = document.createElement("div"); document.body.appendChild(node); root = createRoot(node);
  fetchMock = vi.fn((url: string) => {
    if (url === "/api/stores") return response({ stores: [{ id: store, store_name: "Ma boutique", platform: "chariow", connection_status: "connected", is_active: true }] });
    if (url === "/api/integrations/meta/accounts") return response({ accounts: [{ id: account, name: "Mon compte" }] });
    if (url.startsWith("/api/integrations/meta/resources")) return response({ pages: [{ id: "page-1", name: "Ma page" }] });
    if (url.startsWith("/api/analytics")) return response({ snapshot: { products: [{ id: "product-1", name: "Mon produit", url: "https://example.com/product", description: "Description" }] } });
    throw new Error(`Requête inattendue : ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  act(() => root.unmount()); node.remove(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("Pack de variantes — interface", () => {
  it("garde Ventes sans sélecteur d'objectif et retire l’explication des placements", async () => {
    await mount(1);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Ventes");
    expect(dialog.textContent).toContain("Trafic est utilisé automatiquement uniquement");
    expect(dialog.textContent).not.toContain("Placements : automatiques");
    expect([...dialog.querySelectorAll("select")].some((s) => [...s.options].some((o) => o.textContent === "Interactions"))).toBe(false);
    expect(JSON.parse(localStorage.getItem("vendeo_ad_variant_pack_draft_v1")!).objective).toBe("sales");
  });

  it("propose les mêmes CTA Meta et conserve le choix par variante", async () => {
    await mount(3);
    const select = document.querySelector('select[aria-label="Bouton d’appel à l’action — Angle a"]') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(["SHOP_NOW", "LEARN_MORE", "BUY_NOW", "ORDER_NOW", "DOWNLOAD", "GET_OFFER", "CONTACT_US"]);
    act(() => { select.value = "DOWNLOAD"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(JSON.parse(localStorage.getItem("vendeo_ad_variant_pack_draft_v1")!).variants.a.callToAction).toBe("DOWNLOAD");
  });

  it("montre l’aperçu local et le spinner pendant l’envoi, puis conserve l’URL vérifiée", async () => {
    let resolveUpload!: (value: { secure_url: string; fingerprinted: boolean; media_asset_id: string }) => void;
    vi.mocked(uploadCampaignMedia).mockImplementation(() => new Promise((resolve) => { resolveUpload = resolve; }));
    await mount(3);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["image"], "image.jpg", { type: "image/jpeg" })] });
    await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(document.querySelector('img[src="blob:local-preview"]')).not.toBeNull();
    expect(document.querySelector('[role="status"]')?.textContent).toContain("Envoi en cours");
    expect(button("Continuer").disabled).toBe(true);
    await act(async () => { resolveUpload({ secure_url: "https://example.com/uploaded.jpg", fingerprinted: true, media_asset_id: "asset-1" }); });
    expect(document.querySelector('img[src="https://example.com/uploaded.jpg"]')).not.toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:local-preview");
    expect(JSON.parse(localStorage.getItem("vendeo_ad_variant_pack_draft_v1")!).variants.a.media).toEqual(["https://example.com/uploaded.jpg"]);
  });

  it("affiche les vrais visuels et CTA dans le récapitulatif", async () => {
    await mount(4);
    for (const id of ids) expect(document.querySelector(`img[src="https://example.com/${id}.jpg"]`)).not.toBeNull();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Acheter");
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("Placements : automatiques");
  });

  it("suit les étapes confirmées, puis affiche 100 % seulement après succès et ne lance qu’une fois", async () => {
    let resolveLaunch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
    const baseFetch = fetchMock.getMockImplementation() as (url: string, options?: RequestInit) => Promise<unknown>;
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/ad-variant-packs") return response({ pack: { id: "pack-server", status: "draft" } });
      if (url === "/api/ad-variant-packs/pack-server/launch") return new Promise((resolve) => { resolveLaunch = resolve; });
      if (url === "/api/ad-variant-packs/pack-server") return response({ pack: { status: "claimed" }, progress: 37 });
      return baseFetch(url, options);
    });
    await mount(4);
    const launchButton = button("Confirmer et lancer");
    expect(launchButton.disabled).toBe(false);
    await act(async () => { launchButton.click(); });
    await settle();
    expect(document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("37");
    expect(button("Lancement").disabled).toBe(true);
    expect((document.querySelector('[aria-label="Fermer"]') as HTMLButtonElement).disabled).toBe(false);
    const launchCalls = fetchMock.mock.calls.filter(([url]) => url === "/api/ad-variant-packs/pack-server/launch");
    expect(launchCalls).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("vendeo_ad_variant_pack_draft_v1")!).launchRequested).toBe(true);
    const createCall = fetchMock.mock.calls.find(([url]) => url === "/api/ad-variant-packs")!;
    expect(JSON.parse((createCall[1] as RequestInit).body as string)).toMatchObject({ dsa_beneficiary: "Mon compte", dsa_payor: "Mon compte" });
    expect(JSON.parse((createCall[1] as RequestInit).body as string).variants.map((v: { call_to_action: string }) => v.call_to_action)).toEqual(["SHOP_NOW", "SHOP_NOW", "SHOP_NOW"]);
    await act(async () => { resolveLaunch({ ok: true, json: async () => ({ pack: { status: "completed", checkpoints: { activated: true } }, progress: 100 }) }); });
    expect(document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("100");
    expect(document.body.textContent).toContain("Une campagne Meta avec trois ensembles");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/ad-campaigns/"))).toHaveLength(0);
  });

  it("ne réessaie pas automatiquement un lancement devenu incertain après rafraîchissement", async () => {
    const baseFetch = fetchMock.getMockImplementation() as (url: string, options?: RequestInit) => Promise<unknown>;
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/ad-variant-packs/pack-server") return response({ pack: { status: "ambiguous" }, progress: 100 });
      return baseFetch(url, options);
    });
    seed(4);
    const saved = JSON.parse(localStorage.getItem("vendeo_ad_variant_pack_draft_v1")!);
    localStorage.setItem("vendeo_ad_variant_pack_draft_v1", JSON.stringify({ ...saved, serverPackId: "pack-server", launchRequested: true }));
    await act(async () => { root.render(<VariantPackWizard storeId={store} onClose={vi.fn()} onLaunched={vi.fn()} />); });
    await settle();
    expect(document.body.textContent).toContain("Le lancement n’est pas confirmé");
    expect(button("Confirmer et lancer").disabled).toBe(true);
    expect(document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).not.toBe("100");
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/launch"))).toBe(false);
  });

  it("n’annonce pas 100 % si un état terminé ne prouve pas l’activation", async () => {
    const baseFetch = fetchMock.getMockImplementation() as (url: string, options?: RequestInit) => Promise<unknown>;
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/ad-variant-packs/pack-server") return response({ pack: { status: "completed", checkpoints: {} }, progress: 100 });
      return baseFetch(url, options);
    });
    seed(4);
    const saved = JSON.parse(localStorage.getItem("vendeo_ad_variant_pack_draft_v1")!);
    localStorage.setItem("vendeo_ad_variant_pack_draft_v1", JSON.stringify({ ...saved, serverPackId: "pack-server", launchRequested: true }));
    await act(async () => { root.render(<VariantPackWizard storeId={store} onClose={vi.fn()} onLaunched={vi.fn()} />); });
    await settle();
    expect(document.body.textContent).not.toContain("Pack lancé");
    expect(document.body.textContent).toContain("Le lancement n’est pas confirmé");
    expect(button("Confirmer et lancer").disabled).toBe(true);
    expect(document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).not.toBe("100");
  });

  it("propose de corriger un pack uniquement après un précontrôle sans création Meta", async () => {
    const baseFetch = fetchMock.getMockImplementation() as (url: string, options?: RequestInit) => Promise<unknown>;
    fetchMock.mockImplementation((url: string, options?: RequestInit) => {
      if (url === "/api/ad-variant-packs/pack-server") return response({ pack: { status: "blocked", last_error: "Aucune campagne n’a été créée : image non vérifiée." }, progress: 0 });
      return baseFetch(url, options);
    });
    seed(4);
    const saved = JSON.parse(localStorage.getItem("vendeo_ad_variant_pack_draft_v1")!);
    localStorage.setItem("vendeo_ad_variant_pack_draft_v1", JSON.stringify({ ...saved, serverPackId: "pack-server", packId: "old-request", launchRequested: true }));
    await act(async () => { root.render(<VariantPackWizard storeId={store} onClose={vi.fn()} onLaunched={vi.fn()} />); });
    await settle();
    expect(document.body.textContent).toContain("Aucune campagne n’a été créée");
    await act(async () => { button("Corriger mon pack").click(); });
    const corrected = JSON.parse(localStorage.getItem("vendeo_ad_variant_pack_draft_v1")!);
    expect(corrected.serverPackId).toBeUndefined();
    expect(corrected.packId).toBeUndefined();
    expect(corrected.launchRequested).toBe(false);
    expect(button("Confirmer et lancer").disabled).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/launch"))).toBe(false);
  });
});
