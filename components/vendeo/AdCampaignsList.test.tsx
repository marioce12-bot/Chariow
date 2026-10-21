import { act, createElement } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { JSDOM } = require("jsdom") as { JSDOM: new (html: string, options: { url: string }) => any };
import { getMetaCampaignLifecycle } from "@/lib/meta/status";
import { NavigationDataProvider } from "@/components/dashboard/NavigationDataCache";

vi.mock("./wizard/ResumeCampaignModal", () => ({ ResumeCampaignModal: () => createElement("div", null, "Resume modal") }));
vi.mock("./wizard/LaunchAdWizard", () => ({ LaunchAdWizard: ({ duplicateCampaign }: { duplicateCampaign?: { id: string } }) => createElement("div", { "data-testid": "wizard" }, duplicateCampaign ? `New draft from ${duplicateCampaign.id}` : "Wizard") }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string, vars?: Record<string, string | number>) => ({ "campaigns.title": "Campagnes", "campaigns.empty": "Aucune campagne", "campaigns.loading": "Chargement", "campaigns.refresh": "Actualiser", "campaigns.launch": "Lancer", "campaigns.duplicate": "Dupliquer", "campaigns.more": "Plus", "campaigns.reduce": "Réduire", "adsExtra.status.paused": "Suspendue", "adsExtra.status.active": "Active", "adsExtra.status.archived": "Archivée", "adsExtra.status.deleted": "Supprimée chez Meta", "adsExtra.duplicate": "Dupliquer", "adsExtra.resume": "Reprendre", "adsExtra.poster_alt": "Affiche de la campagne", "adsExtra.traffic_without_pixel": "Trafic (sans pixel)", "adsExtra.history": `Historique des campagnes (${vars?.count})` }[key] ?? key) }) }));

const campaign = (id: string, status: string, external_error: string | null = null, created_at = "2026-01-01") => ({ id, product_id: id, platform: "meta", status, objective: "sales", title: id, daily_budget: 5, duration_days: 3, estimated_budget: 15, external_error, created_at });
const fixtures = [
  campaign("legacy-archive", "paused", "The campaign is archived. This ad will not deliver."),
  campaign("deleted", "deleted", "META_DELETED: deleted"),
  campaign("paused", "paused", null, "2026-01-03"),
  campaign("active-old", "active", null, "2026-01-02"),
  campaign("active", "active", null, "2026-01-04"),
];

let dom: any;
let container: HTMLElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let backendCampaigns: typeof fixtures;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  container = dom.window.document.getElementById("root")!;
  root = createRoot(container);
  backendCampaigns = fixtures;
  fetchMock = vi.fn(async (url: string) => url === "/api/subscription" ? { ok: true, json: async () => ({ subscription: { plan: "starter" } }) } : { ok: true, json: async () => ({ campaigns: backendCampaigns }) });
  vi.stubGlobal("fetch", fetchMock);
  const { AdCampaignsList } = await import("./AdCampaignsList");
  await act(async () => { root.render(createElement(NavigationDataProvider, { children: createElement(AdCampaignsList, { storeId: "store", onNewCampaign: vi.fn() }) })); await new Promise((resolve) => setTimeout(resolve, 0)); });
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); dom.window.close(); });

describe("AdCampaignsList lifecycle UI", () => {
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
    expect(container.querySelector<HTMLImageElement>(".ad-campaign-thumb")?.src).toBe("https://example.test/updated.jpg");

    await act(async () => {
      container.querySelector<HTMLElement>(".ad-campaign-row")!.click();
    });
    expect(container.textContent).toContain("Texte actualisé");

    backendCampaigns = backendCampaigns.map((item) => item.id === "active"
      ? { ...item, media_url: "https://example.test/refreshed.jpg", ad_text: "Texte après refresh" }
      : item);
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Actualiser"]')!.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector<HTMLImageElement>(".ad-campaign-detail img")?.src).toBe("https://example.test/refreshed.jpg");
    expect(container.querySelector(".ad-campaign-detail")?.textContent).toContain("Texte après refresh");
  });
  it("duplicates a current campaign without launching a provider campaign", async () => {
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".ad-campaign-row .ad-campaign-duplicate")!.click();
    });

    expect(container.querySelector('[data-testid="wizard"]')?.textContent).toBe("New draft from active");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/launch"))).toBe(false);
  });
  it("includes mobile regression rules for wrapping actions, thumb sizing and readable overflow", async () => {
    const css = await import("node:fs").then(({ readFileSync }) => readFileSync(new URL("./ad-campaigns-list.css", import.meta.url), "utf8"));
    expect(css).toContain("flex-wrap: wrap");
    expect(css).toContain("min-width: 0");
    expect(css).toContain("flex: 0 0 42px");
    expect(css).not.toContain("overflow: hidden");
  });
});
