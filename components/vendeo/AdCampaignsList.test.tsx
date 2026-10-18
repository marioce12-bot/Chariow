import { act, createElement } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { JSDOM } = require("jsdom") as { JSDOM: new (html: string, options: { url: string }) => any };
import { getMetaCampaignLifecycle } from "@/lib/meta/status";

vi.mock("./wizard/ResumeCampaignModal", () => ({ ResumeCampaignModal: () => createElement("div", null, "Resume modal") }));
vi.mock("./wizard/LaunchAdWizard", () => ({ LaunchAdWizard: ({ duplicateCampaign }: { duplicateCampaign?: { id: string } }) => createElement("div", { "data-testid": "wizard" }, duplicateCampaign ? `New draft from ${duplicateCampaign.id}` : "Wizard") }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => ({ "campaigns.title": "Campagnes", "campaigns.empty": "Aucune campagne", "campaigns.loading": "Chargement", "campaigns.refresh": "Actualiser", "campaigns.launch": "Lancer", "campaigns.duplicate": "Dupliquer", "campaigns.more": "Plus", "campaigns.reduce": "Réduire" }[key] ?? key) }) }));

const campaign = (id: string, status: string, external_error: string | null = null) => ({ id, product_id: id, platform: "meta", status, objective: "sales", title: id, daily_budget: 5, duration_days: 3, estimated_budget: 15, external_error, created_at: "2026-01-01" });
const fixtures = [
  campaign("legacy-archive", "paused", "The campaign is archived. This ad will not deliver."),
  campaign("deleted", "deleted", "META_DELETED: deleted"),
  campaign("paused", "paused"),
  campaign("active", "active"),
];

let dom: any;
let container: HTMLElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "http://localhost" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  container = dom.window.document.getElementById("root")!;
  root = createRoot(container);
  fetchMock = vi.fn(async (url: string) => url === "/api/subscription" ? { ok: true, json: async () => ({ subscription: { plan: "starter" } }) } : { ok: true, json: async () => ({ campaigns: fixtures }) });
  vi.stubGlobal("fetch", fetchMock);
  const { AdCampaignsList } = await import("./AdCampaignsList");
  await act(async () => { root.render(createElement(AdCampaignsList, { storeId: "store", onNewCampaign: vi.fn() })); await new Promise((resolve) => setTimeout(resolve, 0)); });
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); dom.window.close(); });

describe("AdCampaignsList lifecycle UI", () => {
  it("keeps archived/deleted entries out of current campaigns and hides history by default", () => {
    expect(getMetaCampaignLifecycle("paused", fixtures[0].external_error)).toBe("archived");
    expect(getMetaCampaignLifecycle("deleted", fixtures[1].external_error)).toBe("deleted");
    expect(container.textContent).toContain("paused");
    expect(container.textContent).toContain("active");
    expect(container.querySelector("details")?.open).toBe(false);
    expect(container.textContent).toContain("Historique des campagnes (2)");
    expect(container.querySelector(".ad-campaign-history-list")).not.toBeNull();
    expect([...container.querySelectorAll(".ad-campaign-history-list button")].some((button) => /Lancer|Reprendre/.test(button.textContent ?? ""))).toBe(false);
  });
  it("shows no launch or direct-edit controls for ended campaigns in expanded history", async () => {
    const summary = container.querySelector("summary")!;
    await act(async () => { summary.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
    const details = container.querySelector("details")!;
    expect(details.open).toBe(true);
    expect(details.textContent).toContain("legacy-archive");
    expect(details.textContent).toContain("Supprimée chez Meta");
    expect(details.querySelector("button")?.textContent).toContain("Dupliquer");
    expect(details.textContent).not.toContain("Lancer");
    expect(details.textContent).not.toContain("Reprendre");
  });
  it("opens the duplicate wizard from the visible Dupliquer action without calling a provider API", async () => {
    await act(async () => { container.querySelector("summary")!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
    const archiveRow = [...container.querySelectorAll(".ad-campaign-history-list .ad-campaign-row")].find((row) => row.textContent?.includes("legacy-archive"))!;
    const button = archiveRow.querySelector("button[aria-label='Dupliquer']")!;
    await act(async () => { button.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true })); });
    expect(container.textContent).toContain("New draft from legacy-archive");
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
