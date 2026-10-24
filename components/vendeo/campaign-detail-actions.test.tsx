import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { translate } from "@/lib/i18n/translate";
const { JSDOM } = require("jsdom");
const state = vi.hoisted(() => ({ locale: "fr" as "fr" | "en", status: "paused" }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: state.locale, t: (key: string, vars?: Record<string, string | number>) => translate(state.locale, key, vars) }) }));
vi.mock("@/components/dashboard/NavigationDataCache", () => ({
  useNavigationCache: () => ({ load: vi.fn(), invalidate: vi.fn() }),
  useNavigationData: () => ({ loading: false, data: { campaigns: [{ id: "fixture", product_id: "product", platform: "meta", status: state.status, title: "Test campaign", objective: "sales", daily_budget: 4, duration_days: 1, estimated_budget: 4, external_error: null, created_at: "2026-10-19" }] } }),
}));
vi.mock("./wizard/ResumeCampaignModal", () => ({ ResumeCampaignModal: () => createElement("div", { "data-testid": "resume" }) }));
vi.mock("./wizard/LaunchAdWizard", () => ({ LaunchAdWizard: ({ duplicateCampaign }: { duplicateCampaign?: unknown }) => createElement("div", { "data-testid": duplicateCampaign ? "duplicate" : "edit" }) }));
import { AdCampaignsList } from "./AdCampaignsList";
let dom: any;
let container: HTMLElement;
let root: Root;
let confirmMock: ReturnType<typeof vi.fn>;
const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => Response.json({}));
beforeEach(() => {
  state.locale = "fr"; state.status = "paused";
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  dom = new JSDOM("<!doctype html><div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
  container = document.getElementById("root")!; root = createRoot(container);
  fetchMock.mockClear(); vi.stubGlobal("fetch", fetchMock);
  confirmMock = vi.fn(() => false); dom.window.confirm = confirmMock;
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); dom.window.close(); });
async function open() {
  await act(async () => root.render(createElement(AdCampaignsList, { storeId: "store", plan: "starter", onNewCampaign: vi.fn() })));
  const row = container.querySelector(".ad-campaign-row[role='button']") as HTMLElement;
  expect(row).not.toBeNull();
  await act(async () => row.click());
}
function button(key: string) {
  const label = translate(state.locale, key);
  const found = [...container.querySelectorAll<HTMLButtonElement>(".ad-campaign-modal-actions button")].find(b => b.textContent?.trim() === label);
  expect(found, label).toBeDefined(); return found!;
}
function noWrites() { expect(fetchMock.mock.calls.some(([, options]) => options?.method && options.method !== "GET")).toBe(false); }
describe("campaign detail actions", () => {
  it.each(["fr", "en"] as const)("preserves four readable %s labels and delete cancellation", async locale => {
    state.locale = locale; await open();
    expect(container.querySelectorAll(".ad-campaign-modal-actions button")).toHaveLength(4);
    for (const key of ["ads.correction.edit", "adsExtra.duplicate", "adsExtra.resume", "ads.correction.deleteCampaign"]) button(key);
    await act(async () => button("ads.correction.deleteCampaign").click());
    expect(confirmMock).toHaveBeenCalledWith("Supprimer cette campagne ?"); noWrites();
    expect(container.querySelector(".ad-campaign-detail")).not.toBeNull();
  });
  it.each(["draft", "paid", "paused", "autopilot_paused"])("opens resume/launch for %s without operations", async status => {
    state.status = status; await open();
    await act(async () => button(status === "draft" ? "ads.launchButton" : "adsExtra.resume").click());
    expect(container.querySelector("[data-testid='resume']")).not.toBeNull(); noWrites();
  });
  it.each([["adsExtra.duplicate", "duplicate"], ["ads.correction.edit", "edit"]])("opens %s without campaign operations", async (key, target) => {
    await open(); await act(async () => button(key).click());
    expect(container.querySelector(`[data-testid='${target}']`)).not.toBeNull(); noWrites();
  });
  it("preserves the reduced action eligibility for active campaigns", async () => {
    state.status = "active"; await open();
    expect(container.querySelectorAll(".ad-campaign-modal-actions button")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/pilotage auto|autopilot|budget limit/i);
    button("adsExtra.duplicate"); button("ads.correction.deleteCampaign"); noWrites();
  });
  it("keeps autopilot-paused campaigns readable as paused in both locales", async () => {
    for (const locale of ["fr", "en"] as const) {
      state.locale = locale; state.status = "autopilot_paused"; await open();
      expect(container.querySelector(".ad-campaign-row")?.textContent).toContain(locale === "fr" ? "En pause" : "Paused");
      expect(container.textContent).not.toMatch(/mise en pause par le pilote|paused by autopilot/i);
      await act(async () => { const close = container.querySelector(".ad-campaign-detail button[aria-label]") as HTMLButtonElement; close.click(); });
    }
  });
  it("keeps a mobile two-column grid and touch targets with stronger specificity than global buttons", () => {
    const css = readFileSync(new URL("./ad-campaigns-list.css", import.meta.url), "utf8");
    expect(css).toMatch(/@media\s*\(max-width:\s*640px\)[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(css).toMatch(/\.ad-campaign-modal-actions\s*>\s*button\.btn\s*\{[^}]*min-height:\s*44px[^}]*white-space:\s*nowrap/);
  });
});
