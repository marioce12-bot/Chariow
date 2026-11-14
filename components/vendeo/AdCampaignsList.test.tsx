import { act, createElement } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { JSDOM } = require("jsdom") as { JSDOM: new (html: string, options: { url: string }) => any };
import { getMetaCampaignLifecycle } from "@/lib/meta/status";
import { NavigationDataProvider } from "@/components/dashboard/NavigationDataCache";

vi.mock("./wizard/ResumeCampaignModal", () => ({ ResumeCampaignModal: () => createElement("div", null, "Resume modal") }));
vi.mock("./wizard/LaunchAdWizard", () => ({ LaunchAdWizard: ({ duplicateCampaign }: { duplicateCampaign?: { id: string } }) => createElement("div", { "data-testid": "wizard" }, duplicateCampaign ? `New draft from ${duplicateCampaign.id}` : "Wizard") }));
vi.mock("./AdVariantPackWizard", () => ({ VariantPackWizard: ({ duplicatePack }: { duplicatePack: { product_name: string } }) => createElement("div", { "data-testid": "pack-wizard" }, `Pack draft from ${duplicatePack.product_name}`) }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string, vars?: Record<string, string | number>) => ({ "campaigns.title": "Campagnes", "campaigns.empty": "Aucune campagne", "campaigns.loading": "Chargement", "campaigns.refresh": "Actualiser", "campaigns.launch": "Lancer", "campaigns.duplicate": "Dupliquer", "campaigns.more": "Plus", "campaigns.reduce": "Réduire", "adsExtra.status.paused": "Suspendue", "adsExtra.status.active": "Active", "adsExtra.status.archived": "Archivée", "adsExtra.status.deleted": "Supprimée chez Meta", "adsExtra.duplicate": "Dupliquer", "adsExtra.resume": "Reprendre", "adsExtra.poster_alt": "Affiche de la campagne", "adsExtra.traffic_without_pixel": "Trafic (sans pixel)", "adsExtra.history": `Historique des campagnes (${vars?.count})` }[key] ?? key) }) }));

const campaign = (id: string, status: string, external_error: string | null = null, created_at = "2026-01-01") => ({ id, product_id: id, platform: "meta", status, objective: "sales", title: id, daily_budget: 5, duration_days: 3, estimated_budget: 15, external_error, created_at });
const fixtures = [
  campaign("legacy-archive", "paused", "The campaign is archived. This ad will not deliver."),
  campaign("deleted", "deleted", "META_DELETED: deleted"),
  campaign("paused", "paused", null, "2026-01-03"),
  campaign("active-old", "active", null, "2026-01-02"),
  campaign("active", "active", null, "2026-01-04"),
];
const completedPack = {
  id: "pack-1", product_name: "Produit pack test", status: "completed", daily_budget: 7, duration_days: 5,
  created_at: "2026-01-05", checkpoints: { activated: true, adsets: ["set-1"], ads: ["ad-1", "ad-2", "ad-3"], meta_state: { status: "active", synced_at: "2026-11-14T08:00:00.000Z", ads: [{ id: "ad-1", status: "active" }, { id: "ad-2", status: "active" }, { id: "ad-3", status: "paused" }] } },
  variants: [
    { id: "v1", angle: "Angle image", format: "image", media: ["https://example.test/one.jpg"] },
    { id: "v2", angle: "Angle vidéo", format: "video", media: ["https://example.test/two.mp4"] },
    { id: "v3", angle: "Angle carrousel", format: "carousel", media: ["https://example.test/three.jpg", "https://example.test/four.jpg"] },
  ],
};

let dom: any;
let container: HTMLElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let backendCampaigns: typeof fixtures;
let backendPacks: typeof completedPack[];

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(document, "hasFocus", { configurable: true, value: () => true });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  container = dom.window.document.getElementById("root")!;
  root = createRoot(container);
  backendCampaigns = fixtures;
  backendPacks = [];
  fetchMock = vi.fn(async (url: string) => url === "/api/subscription"
    ? { ok: true, json: async () => ({ subscription: { plan: "starter" } }) }
    : url.startsWith("/api/ad-variant-packs")
      ? { ok: true, json: async () => ({ packs: backendPacks }) }
      : { ok: true, json: async () => ({ campaigns: backendCampaigns }) });
  vi.stubGlobal("fetch", fetchMock);
  const { AdCampaignsList } = await import("./AdCampaignsList");
  await act(async () => { root.render(createElement(NavigationDataProvider, { children: createElement(AdCampaignsList, { storeId: "store", onNewCampaign: vi.fn(), includeVariantPacks: true }) })); await new Promise((resolve) => setTimeout(resolve, 0)); });
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); dom.window.close(); });

describe("AdCampaignsList lifecycle UI", () => {
  it("shows a launched Pack as one distinct group with its three visual variants", async () => {
    backendPacks = [completedPack];
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Actualiser"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelectorAll(".ad-variant-pack-card")).toHaveLength(1);
    expect(container.querySelectorAll(".ad-variant-pack-variant")).toHaveLength(3);
    expect(container.textContent).toContain("Produit pack test");
    expect(container.textContent).toContain("Campagne groupée");
    expect(container.textContent).toContain("1 ensemble · 3 publicités");
    expect(container.textContent).toContain("Active");
    expect(container.textContent).toContain("Statut actuel synchronisé depuis Meta.");
    expect(container.querySelector<HTMLImageElement>('.ad-variant-pack-variant img')?.src).toBe("https://example.test/one.jpg");
    expect(container.querySelector(".ad-variant-pack-status")?.textContent).toBe("Active");
    expect([...container.querySelectorAll(".ad-campaign-row")].map((row) => row.textContent?.match(/active(?:-old)?|paused/)?.[0])).toEqual(["active", "active-old", "paused"]);
    const packCalls = fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/ad-variant-packs"));
    expect(packCalls.length).toBeGreaterThan(0);
    expect(packCalls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
  });

  it("prepares and confirms a pause for one Pack ad only", async () => {
    backendPacks = [completedPack];
    const confirmation = vi.fn(() => true);
    dom.window.confirm = confirmation;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/ad-variant-packs/pack-1/actions") {
        const body = JSON.parse(String(init?.body));
        return body.phase === "prepare"
          ? { ok: true, json: async () => ({ token: "pack-confirmation", preview: { name: "Produit pack test", warning: "Mettre en pause uniquement « Angle image » (ad-1). Les autres publicités ne seront pas modifiées." } }) }
          : { ok: true, json: async () => ({ meta_state: { status: "active" } }) };
      }
      if (url === "/api/subscription") return { ok: true, json: async () => ({ subscription: { plan: "starter" } }) };
      return url.startsWith("/api/ad-variant-packs") ? { ok: true, json: async () => ({ packs: backendPacks }) } : { ok: true, json: async () => ({ campaigns: backendCampaigns }) };
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Actualiser"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const pauseAd = container.querySelector<HTMLButtonElement>(".ad-variant-pack-variant button")!;
    await act(async () => {
      pauseAd.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const actionCalls = fetchMock.mock.calls.filter(([url]) => url === "/api/ad-variant-packs/pack-1/actions") as unknown as Array<[string, RequestInit]>;
    expect(confirmation).toHaveBeenCalledWith(expect.stringContaining("uniquement « Angle image »"));
    expect(actionCalls.map(([, init]) => JSON.parse(String(init.body)).phase)).toEqual(["prepare", "execute"]);
    expect(JSON.parse(String(actionCalls[1][1].body))).toMatchObject({ action: "pause-ad", adIndex: 0, token: "pack-confirmation", confirmed: true });
  });

  it("opens a Pack copy as a draft without creating or launching Meta objects", async () => {
    backendPacks = [completedPack];
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/ad-variant-packs/pack-1") return { ok: true, json: async () => ({ pack: { ...completedPack, meta_ad_account_id: "account-1", meta_page_id: "page-1" } }) };
      if (url === "/api/subscription") return { ok: true, json: async () => ({ subscription: { plan: "starter" } }) };
      return url.startsWith("/api/ad-variant-packs") ? { ok: true, json: async () => ({ packs: backendPacks }) } : { ok: true, json: async () => ({ campaigns: backendCampaigns }) };
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Actualiser"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const duplicate = [...container.querySelectorAll<HTMLButtonElement>(".ad-variant-pack-actions button")].find((button) => button.textContent?.includes("Dupliquer"))!;
    await act(async () => { duplicate.click(); await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(container.querySelector('[data-testid="pack-wizard"]')?.textContent).toBe("Pack draft from Produit pack test");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/launch"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/actions"))).toBe(false);
  });

  it("shows active campaigns first in launch order and omits historical campaigns from the UI", () => {
    expect(getMetaCampaignLifecycle("paused", fixtures[0].external_error)).toBe("archived");
    expect(getMetaCampaignLifecycle("deleted", fixtures[1].external_error)).toBe("deleted");
    const visible = [...container.querySelectorAll(".ad-campaign-row")].map((row) => row.textContent ?? "");
    expect(visible.map((text) => text.match(/active(?:-old)?|paused/)?.[0])).toEqual(["active", "active-old", "paused"]);
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector(".ad-campaign-history-list")).toBeNull();
    expect(container.textContent).not.toContain("legacy-archive");
    expect(container.textContent).not.toContain("Historique des campagnes");
  });
  it("refreshes the thumbnail and an already-open detail from revised backend data", async () => {
    backendCampaigns = fixtures.map((item) => item.id === "active"
      ? { ...item, media_url: "https://example.test/updated.jpg", ad_text: "Texte actualisé" }
      : item);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Actualiser"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector<HTMLImageElement>(".ad-campaign-thumb img")?.src).toBe("https://example.test/updated.jpg");

    await act(async () => {
      container.querySelector<HTMLElement>(".ad-campaign-row")!.click();
    });
    expect(document.body.textContent).toContain("Texte actualisé");

    backendCampaigns = backendCampaigns.map((item) => item.id === "active"
      ? { ...item, media_url: "https://example.test/refreshed.jpg", ad_text: "Texte après refresh" }
      : item);
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Actualiser"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(document.body.querySelector<HTMLImageElement>(".ad-campaign-detail img")?.src).toBe("https://example.test/refreshed.jpg");
    expect(document.body.querySelector(".ad-campaign-detail")?.textContent).toContain("Texte après refresh");
  });
  it("revalidates a linked Meta media failure without launching or editing the provider campaign", async () => {
    backendCampaigns = fixtures.map((item) => item.id === "active"
      ? { ...item, media_url: "https://example.test/unavailable.jpg", external_campaign_id: "meta-campaign" }
      : item);
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Actualiser"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    fetchMock.mockClear();
    await act(async () => {
      container.querySelector(".ad-campaign-thumb img")!.dispatchEvent(new dom.window.Event("error"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/ad-campaigns/active/status")).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/ad-campaigns?store_id=store")).toBe(true);
    expect(fetchMock.mock.calls.every((call) => !(call as unknown as [string, RequestInit?])[1]?.method)).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => /launch|pause|resume/.test(String(url)))).toBe(false);
    expect(container.querySelector('.ad-campaign-thumb [role="img"]')).not.toBeNull();
  });
  it("duplicates a current campaign without launching a provider campaign", async () => {
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".ad-campaign-row .ad-campaign-duplicate")!.click();
    });

    expect(container.querySelector('[data-testid="wizard"]')?.textContent).toBe("New draft from active");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/launch"))).toBe(false);
  });
  it("prepares and confirms a Meta pause through the existing safe action flow", async () => {
    backendCampaigns = fixtures.map((item) => item.id === "active"
      ? { ...item, external_campaign_id: "meta-campaign", external_adset_id: "meta-adset", external_ad_id: "meta-ad", meta_ad_account_id: "meta-account" }
      : item);
    const confirmation = vi.fn(() => true);
    dom.window.confirm = confirmation;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/chat/campaign-actions") {
        const body = JSON.parse(String(init?.body));
        return body.phase === "prepare"
          ? { ok: true, json: async () => ({ token: "mock-confirmation", preview: { name: "Active Meta", warning: "Pause on all three Meta objects" } }) }
          : { ok: true, json: async () => ({ campaign: { id: "active", status: "paused" } }) };
      }
      return url === "/api/subscription" ? { ok: true, json: async () => ({ subscription: { plan: "starter" } }) } : { ok: true, json: async () => ({ campaigns: backendCampaigns }) };
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Actualiser"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => { container.querySelector<HTMLElement>(".ad-campaign-row")!.click(); });
    const pauseButton = document.body.querySelector<HTMLButtonElement>(".ad-campaign-detail .ad-campaign-modal-actions button")!;
    await act(async () => {
      pauseButton.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const actionCalls = fetchMock.mock.calls.filter(([url]) => url === "/api/chat/campaign-actions") as unknown as Array<[string, RequestInit]>;
    expect(confirmation).toHaveBeenCalledWith(expect.stringContaining("Pause on all three Meta objects"));
    expect(actionCalls.map(([, init]) => JSON.parse(String(init.body)).phase)).toEqual(["prepare", "execute"]);
    expect(JSON.parse(String(actionCalls[1][1].body))).toMatchObject({ action: "pause", token: "mock-confirmation", confirmed: true });
  });
  it("does not execute the Meta action when the confirmation is declined", async () => {
    backendCampaigns = fixtures.map((item) => item.id === "active"
      ? { ...item, external_campaign_id: "meta-campaign", external_adset_id: "meta-adset", external_ad_id: "meta-ad", meta_ad_account_id: "meta-account" }
      : item);
    dom.window.confirm = vi.fn(() => false);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/chat/campaign-actions") return { ok: true, json: async () => ({ token: "mock-confirmation", preview: { name: "Active Meta", warning: "Pause on all three Meta objects" } }) };
      return url === "/api/subscription" ? { ok: true, json: async () => ({ subscription: { plan: "starter" } }) } : { ok: true, json: async () => ({ campaigns: backendCampaigns }) };
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Actualiser"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => { container.querySelector<HTMLElement>(".ad-campaign-row")!.click(); });
    await act(async () => {
      document.body.querySelector<HTMLButtonElement>(".ad-campaign-detail .ad-campaign-modal-actions button")!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const phases = fetchMock.mock.calls.filter(([url]) => url === "/api/chat/campaign-actions").map(([, init]) => JSON.parse(String((init as RequestInit).body)).phase);
    expect(phases).toEqual(["prepare"]);
  });
  it("keeps the campaign detail open and shows the error when Meta refuses deletion", async () => {
    dom.window.confirm = vi.fn(() => true);
    fetchMock.mockImplementation(async (url: string) => url === "/api/ad-campaigns?id=active"
      ? { ok: false, json: async () => ({ error: "Meta n’a pas confirmé la suppression; la campagne a été conservée dans Vendeo." }) }
      : url === "/api/subscription" ? { ok: true, json: async () => ({ subscription: { plan: "starter" } }) } : { ok: true, json: async () => ({ campaigns: backendCampaigns }) });
    await act(async () => { container.querySelector<HTMLElement>(".ad-campaign-row")!.click(); });
    await act(async () => {
      document.body.querySelector<HTMLButtonElement>(".ad-campaign-detail .btn-danger-ghost")!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.body.querySelector(".ad-campaign-detail")).not.toBeNull();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("la campagne a été conservée");
  });
  it("includes mobile regression rules for wrapping actions, thumb sizing and readable overflow", async () => {
    const css = await import("node:fs").then(({ readFileSync }) => readFileSync(new URL("./ad-campaigns-list.css", import.meta.url), "utf8"));
    expect(css).toContain("flex-wrap: wrap");
    expect(css).toContain("min-width: 0");
    expect(css).toContain("flex: 0 0 42px");
    expect(css).toMatch(/\.ad-campaign-detail-content\s*\{[^}]*overflow-y:\s*auto/);
  });
});
