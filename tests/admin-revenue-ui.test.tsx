// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ locale: "fr", fetchAdminJson: vi.fn() }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: mocks.locale }) }));
vi.mock("@/lib/admin-fetch", () => ({ fetchAdminJson: mocks.fetchAdminJson }));
import { AdminRevenue } from "@/components/AdminRevenue";
let container: HTMLDivElement; let root: Root;
const summary = { complete: true, total: 800, subscriptions: 0, studio: 800, subscriptionPayments: 0, studioPayments: 2, currency: "XOF", firstRecordedAt: "2026-09-20T19:17:59Z", asOf: "2026-10-18T20:00:00Z", period: { preset: "all", start: null, end: "2026-10-18T20:00:00Z", timeZone: "UTC", startAt: null, endAt: "2026-10-18T20:00:00Z" }, series: [{ date: "2026-09-20", subscriptions: 0, studio: 800, total: 800 }] };
beforeEach(() => { vi.clearAllMocks(); mocks.locale = "fr"; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function render() { await act(async () => { root.render(<AdminRevenue />); }); }
async function selectPeriod(value: string) {
  await act(async () => { const select = container.querySelector("select")!; select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function dateInput(index: number, value: string) {
  await act(async () => { const input = container.querySelectorAll("input")[index]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function submit() { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
describe("admin SaaS revenue UI", () => {
  it("preserves category totals and chart but removes requested explanatory labels and UTC jargon", async () => {
    mocks.fetchAdminJson.mockResolvedValue({ revenue: summary }); await render();
    expect(container.textContent).toContain("Chiffre d’affaires SaaS Vendeo");
    expect(container.textContent).toContain("Abonnements0 XOF");
    expect(container.textContent).toContain("Recharges Studio800 XOF");
    expect(container.textContent).toContain("20/09/2026");
    expect(container.textContent).toContain("Tout l’historique enregistré");
    for (const removed of ["UTC", "Sources", "paiement(s)", "Un zéro", "payment_events", "MRR"]) expect(container.textContent).not.toContain(removed);
    expect(container.querySelectorAll(".admin-revenue-grid article")).toHaveLength(3);
    expect(container.querySelector('svg[role="group"]')).not.toBeNull();
    expect(container.querySelectorAll(".admin-revenue-chart-bar")).toHaveLength(1);
    expect(container.querySelector(".admin-revenue-chart-line")).toBeNull();
    expect(container.querySelector("details summary")?.textContent).toBe("Voir les revenus par jour");
  });
  it("shows exact date and XOF breakdown when a chart point receives keyboard or touch focus", async () => {
    mocks.fetchAdminJson.mockResolvedValue({ revenue: summary }); await render();
    const point = container.querySelector<SVGRectElement>(".admin-revenue-chart-bar")!;
    expect(point.getAttribute("aria-label")).toContain("20/09/2026");
    expect(point.getAttribute("aria-label")).toContain("800 XOF");
    await act(async () => point.focus());
    const detail = container.querySelector(".admin-revenue-chart-detail")!;
    expect(detail.textContent).toContain("20/09/2026");
    expect(detail.textContent).toContain("800 XOF");
    expect(detail.textContent).toContain("Abonnements0 XOF");
    expect(detail.textContent).toContain("Recharges Studio800 XOF");
  });
  it("opens the exact daily amount with a tap/click on a chart point", async () => {
    mocks.fetchAdminJson.mockResolvedValue({ revenue: summary }); await render();
    const point = container.querySelector<SVGRectElement>(".admin-revenue-chart-bar")!;
    await act(async () => point.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.querySelector(".admin-revenue-chart-detail")?.textContent).toContain("800 XOF");
  });
  it("offers an explicitly labelled logarithmic view for small daily amounts alongside a large peak", async () => {
    const peaked = { ...summary, series: [
      { date: "2026-10-01", subscriptions: 0, studio: 0, total: 0 },
      { date: "2026-10-02", subscriptions: 100, studio: 0, total: 100 },
      { date: "2026-10-03", subscriptions: 100, studio: 20, total: 120 },
      { date: "2026-10-04", subscriptions: 0, studio: 10000, total: 10000 },
    ] };
    mocks.fetchAdminJson.mockResolvedValue({ revenue: peaked }); await render();
    expect(container.textContent).toContain("Revenus enregistrés (XOF)");
    expect(container.textContent).toContain("Linéaire · départ à 0 XOF");
    const bars = [...container.querySelectorAll<SVGRectElement>(".admin-revenue-chart-bar")];
    const linearSmallGap = Math.abs(Number(bars[2].getAttribute("y")) - Number(bars[1].getAttribute("y")));
    const logButton = [...container.querySelectorAll("button")].find(button => button.textContent === "Mieux voir les petits montants")!;
    await act(async () => logButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(container.textContent).toContain("Échelle logarithmique · les espacements ne sont pas proportionnels");
    expect(container.querySelector(".admin-revenue-chart-modes button[aria-pressed='true']")?.textContent).toBe("Mieux voir les petits montants");
    expect([...container.querySelectorAll(".admin-revenue-chart-y-label")].map(node => node.textContent)).not.toContain("0");
    const logSmallGap = Math.abs(Number(bars[2].getAttribute("y")) - Number(bars[1].getAttribute("y")));
    expect(logSmallGap).toBeGreaterThan(linearSmallGap);
    await act(async () => bars[0].focus());
    expect(container.querySelector(".admin-revenue-chart-detail")?.textContent).toContain("Aucun revenu enregistré ce jour-là");
  });
  it("does not draw an all-zero chart or invent a zero-scale total", async () => {
    mocks.fetchAdminJson.mockResolvedValue({ revenue: { ...summary, total: 0, studio: 0, studioPayments: 0, series: [
      { date: "2026-10-17", subscriptions: 0, studio: 0, total: 0 },
      { date: "2026-10-18", subscriptions: 0, studio: 0, total: 0 },
    ] } }); await render();
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toContain("Aucun revenu enregistré sur cette période : il n’y a pas de graphique à barres à afficher.");
    expect(container.querySelector("details summary")?.textContent).toBe("Voir les revenus par jour");
  });
  it("supports English controls, categories, chart and localized dates without removed text", async () => {
    mocks.locale = "en"; mocks.fetchAdminJson.mockResolvedValue({ revenue: summary }); await render();
    for (const text of ["Subscriptions0 XOF", "Studio top-ups800 XOF", "Revenue period", "Custom range", "View daily revenue", "09/20/2026"]) expect(container.textContent).toContain(text);
    expect(container.textContent).not.toContain("Sources:"); expect(container.textContent).not.toContain("not cash refunds");
    await selectPeriod("custom"); expect(container.textContent).toContain("Start date"); expect(container.textContent).toContain("End date");
    await submit(); expect(container.querySelector('[role="alert"]')?.textContent).toContain("Enter valid start and end dates");
  });
  it.each(["7d", "30d", "90d", "all"])("requests %s and updates totals, breakdown and chart together", async period => {
    mocks.fetchAdminJson.mockResolvedValueOnce({ revenue: summary }).mockResolvedValue({ revenue: { ...summary, total: 200, studio: 200, period: { ...summary.period, preset: period }, series: [{ date: "2026-10-18", subscriptions: 0, studio: 200, total: 200 }] } }); await render();
    if (period === "all") await selectPeriod("7d");
    await selectPeriod(period);
    expect(mocks.fetchAdminJson).toHaveBeenLastCalledWith(expect.stringContaining(`period=${period}`));
    expect(container.querySelectorAll(".admin-revenue-grid strong")[2].textContent).toBe("200 XOF");
    expect(container.querySelector("tbody")?.textContent).toContain("200 XOF");
    expect(container.querySelector("tbody")?.textContent).not.toContain("800 XOF");
  });
  it("refuses reversed or incomplete dates without an API request and applies valid inclusive dates", async () => {
    mocks.fetchAdminJson.mockResolvedValue({ revenue: summary }); await render(); await selectPeriod("custom");
    await submit(); expect(mocks.fetchAdminJson).toHaveBeenCalledTimes(1);
    await dateInput(0, "2026-10-18"); await dateInput(1, "2026-10-01"); await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ne doit pas être après");
    expect(container.querySelector('input[aria-invalid="true"]')).not.toBeNull(); expect(mocks.fetchAdminJson).toHaveBeenCalledTimes(1);
    await dateInput(1, "2026-10-18"); await submit();
    expect(mocks.fetchAdminJson).toHaveBeenLastCalledWith(expect.stringMatching(/period=custom.*start=2026-10-18&end=2026-10-18/));
    expect(container.querySelector("#revenue-period-error")).toBeNull();
  });
  it("rejects a fully future range clearly without a request", async () => {
    mocks.fetchAdminJson.mockResolvedValue({ revenue: summary }); await render(); await selectPeriod("custom");
    await dateInput(0, "9999-12-31"); await dateInput(1, "9999-12-31"); await submit();
    expect(mocks.fetchAdminJson).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ni dans le futur");
  });
  it("discards a stale response after changing period", async () => {
    let resolveOld!: (value: unknown) => void;
    mocks.fetchAdminJson.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue({ revenue: { ...summary, total: 100, studio: 100 } });
    await render(); await selectPeriod("7d"); await act(async () => resolveOld({ revenue: summary }));
    expect(container.querySelectorAll(".admin-revenue-grid strong")[2].textContent).toBe("100 XOF");
  });
  it("shows no misleading total or chart for unresolved evidence", async () => {
    mocks.fetchAdminJson.mockResolvedValue({ revenue: { ...summary, complete: false, unresolved: 1, total: null, subscriptions: null, studio: null } }); await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("1 écriture");
    expect(container.textContent).not.toContain("800 XOF"); expect(container.querySelectorAll(".admin-revenue-grid strong")[2].textContent).toBe("—"); expect(container.querySelector("svg")).toBeNull();
  });
  it("does not render zero while loading or after an API failure", async () => {
    mocks.fetchAdminJson.mockRejectedValue(new Error()); await render();
    expect(container.textContent).toContain("Revenus indisponibles"); expect(container.textContent).not.toContain("0 XOF");
  });
});
