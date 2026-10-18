// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ locale: "fr", fetchAdminJson: vi.fn() }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: mocks.locale }) }));
vi.mock("@/lib/admin-fetch", () => ({ fetchAdminJson: mocks.fetchAdminJson }));
import { AdminRevenue } from "@/components/AdminRevenue";
let container: HTMLDivElement; let root: Root;
const summary = { complete: true, total: 800, subscriptions: 0, studio: 800, subscriptionPayments: 0, studioPayments: 2, currency: "XOF", firstRecordedAt: "2026-09-20T19:17:59Z", asOf: "2026-10-18T20:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); mocks.locale = "fr"; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
async function render() { await act(async () => { root.render(<AdminRevenue />); }); }
describe("admin SaaS revenue UI", () => {
  it("shows subscription and Studio income separately, XOF, UTC and full recorded period", async () => {
    mocks.fetchAdminJson.mockResolvedValue({ revenue: summary }); await render();
    expect(container.textContent).toContain("Chiffre d’affaires SaaS Vendeo");
    expect(container.textContent).toContain("Abonnements0 XOF");
    expect(container.textContent).toContain("Recharges Studio800 XOF");
    expect(container.textContent).toContain("20/09/2026");
    expect(container.textContent).toContain("UTC");
    expect(container.textContent).toContain("Tout l’historique enregistré");
    expect(container.querySelectorAll(".admin-revenue-grid article")).toHaveLength(3);
  });
  it("supports English, including the distinction between credit and monetary refunds", async () => {
    mocks.locale = "en"; mocks.fetchAdminJson.mockResolvedValue({ revenue: summary }); await render();
    expect(container.textContent).toContain("Subscriptions0 XOF");
    expect(container.textContent).toContain("Studio top-ups800 XOF");
    expect(container.textContent).toContain("not cash refunds");
  });
  it("shows no misleading total for unresolved evidence", async () => {
    mocks.fetchAdminJson.mockResolvedValue({ revenue: { ...summary, complete: false, unresolved: 1, total: null, subscriptions: null, studio: null } }); await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("1 écriture");
    expect(container.textContent).not.toContain("800 XOF");
    expect(container.querySelectorAll(".admin-revenue-grid strong")[2].textContent).toBe("—");
  });
  it("does not render zero while loading or after an API failure", async () => {
    mocks.fetchAdminJson.mockRejectedValue(new Error()); await render();
    expect(container.textContent).toContain("Revenus indisponibles");
    expect(container.textContent).not.toContain("0 XOF");
  });
});
