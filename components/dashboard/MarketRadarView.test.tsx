// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketRadarReport } from "@/lib/market-radar";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr", t: (key: string) => key }) }));

import { MarketRadarView } from "./MarketRadarView";

const product = {
  id: "product-1", name: "Guide Budget", description: "Un guide pour organiser ses dépenses", price: 4500, currency: "XOF", image: null, url: null,
};
const report = {
  query: { idea: "Guide Budget", product: { name: "Guide Budget", description: product.description, category: null, type: null, price: "4500", currency: "XOF" }, format: "ebook", locale: "fr" },
  status: "qualitative",
  analysisMode: "qualitative",
  score: 82,
  confidence: "low",
  scoreRationale: "Le bénéfice est clair et peut être testé avec une offre simple.",
  summary: "Commence par une version courte et observe les retours clients.",
  dimensions: { demandPotential: 78, audienceFit: 84, productFit: 80, monetizationPotential: 68 },
  evidence: [{ label: "Mode d’analyse", value: "Lecture qualitative." }],
  trend: { direction: "qualitative", summary: "Une piste à confirmer par un essai auprès de clients." },
  targetAudience: {
    profile: "Jeunes actifs qui veulent mieux organiser leur budget.",
    rationale: "Le bénéfice est concret et facile à expliquer.",
    metaInterests: [{ id: "1001", name: "Finance personnelle" }],
    metaInterestStatus: "available",
  },
  campaignTiming: { days: ["monday", "thursday"], rationale: "Deux jours espacés facilitent une première comparaison." },
  recommendedCountries: [{
    code: "BJ", name: "Bénin", score: 84, audienceFitScore: 83, productFitScore: 80, confidence: "low", signalStatus: "qualitative",
    trendDirection: "qualitative", trendSummary: "Piste qualitative à explorer.", rationale: "Le contenu peut être adapté avec des exemples locaux.", firstTest: "Teste une page courte avec un exemple de budget.",
  }],
  ideas: [{ title: "Guide budget", promise: "Mieux organiser son argent au quotidien.", audience: "Jeunes actifs", outline: ["Faire le point", "Planifier", "Suivre"], upsell: "Ajouter un modèle de budget." }],
  risks: ["Le score reste une hypothèse à tester."],
  methodology: "Score indicatif, pas une prévision de ventes.",
} as unknown as MarketRadarReport;

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function response(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } }));
}
async function flush() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}
function buttonWithText(text: string) {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes(text))!;
}
function setSelectValue(select: HTMLSelectElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")?.set;
  setValue?.call(select, value);
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/stores") return response({ stores: [{ id: "store-1", store_name: "Ma boutique", platform: "chariow", connection_status: "connected" }] });
    if (url.startsWith("/api/market/radar/catalog")) return response({ products: [product] });
    if (url === "/api/market/radar") return response({ report });
    throw new Error(`Unexpected network request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("MarketRadarView", () => {
  it("asks which path to analyze before showing catalog controls, then submits the selected existing product", async () => {
    await act(async () => root.render(<MarketRadarView onGoToAI={() => {}} />));
    expect(container.textContent).toContain("radar.modeQuestion");
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(container.querySelector('[name="audience"]')).toBeNull();

    await act(async () => buttonWithText("radar.modeExistingTitle").click());
    await flush();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain("/api/stores");
    expect(fetchMock.mock.calls.some((call) => String(call[0]).startsWith("/api/market/radar/catalog"))).toBe(true);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/analytics"))).toBe(false);

    const productSelect = container.querySelector(".market-radar-product-select") as HTMLSelectElement;
    await act(async () => setSelectValue(productSelect, "product-1"));
    const form = container.querySelector("form")!;
    await act(async () => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    await flush();

    const analysisCall = fetchMock.mock.calls.find((call) => String(call[0]) === "/api/market/radar")!;
    const body = JSON.parse((analysisCall[1] as RequestInit).body as string);
    expect(body).toEqual({
      idea: "Guide Budget",
      product: { name: "Guide Budget", description: product.description, category: null, type: null, price: "4500", currency: "XOF" },
      format: "ebook",
      locale: "fr",
    });
    expect(body).not.toHaveProperty("audience");
    expect(body).not.toHaveProperty("audiences");
    expect(container.textContent).toContain("Finance personnelle");
    expect(container.textContent).toContain("radar.audienceTitle");
    expect(container.textContent).toContain("radar.dayMonday");
    expect(container.querySelectorAll("details").length).toBeGreaterThanOrEqual(5);
    expect(container.textContent).not.toMatch(/\bIA\b/);
  });

  it("keeps the new-idea path separate from the catalog and submits no existing product", async () => {
    await act(async () => root.render(<MarketRadarView onGoToAI={() => {}} />));
    await act(async () => buttonWithText("radar.modeNewTitle").click());

    const ideaInput = container.querySelector(".market-radar-idea-field input") as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    setValue?.call(ideaInput, "Un guide pour mieux gérer son budget");
    await act(async () => ideaInput.dispatchEvent(new window.Event("input", { bubbles: true })));
    const form = container.querySelector("form")!;
    expect((form.querySelector(".btn-dark") as HTMLButtonElement).disabled).toBe(false);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).startsWith("/api/market/radar/catalog"))).toBe(false);

    await act(async () => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    await flush();
    const analysisCall = fetchMock.mock.calls.find((call) => String(call[0]) === "/api/market/radar")!;
    const body = JSON.parse((analysisCall[1] as RequestInit).body as string);
    expect(body).toEqual({ idea: "Un guide pour mieux gérer son budget", product: null, format: "ebook", locale: "fr" });
  });
});
