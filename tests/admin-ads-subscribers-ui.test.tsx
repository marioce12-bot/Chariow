// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ locale: "fr", fetchAdminJson: vi.fn() }));
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: mocks.locale }) }));
vi.mock("@/lib/admin-fetch", () => ({ fetchAdminJson: mocks.fetchAdminJson }));
import { AdminAds } from "@/components/AdminAds";
import { AdminSubscribers } from "@/components/AdminSubscribers";
import { AdminTransactions } from "@/components/AdminTransactions";
let container: HTMLDivElement; let root: Root;
beforeEach(() => { vi.clearAllMocks(); mocks.locale = "fr"; (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const period = { preset: "30d", start: "2026-10-07", end: "2026-11-05", timeZone: "UTC", startAt: "2026-10-07T00:00:00.000Z", endAt: "2026-11-05T12:00:00.000Z" };

describe("admin ads block", () => {
  it("shows the all-time total next to the active count for the chosen period", async () => {
    mocks.fetchAdminJson.mockResolvedValue({ ads: { total_launched: 42, total_launched_users: 9, active_now: 5, launched_in_period: 8, active_in_period: 11, by_platform: { meta: 40, tiktok: 2 }, active_in_period_by_platform: { meta: 11 }, by_status: {}, period } });
    await act(async () => { root.render(<AdminAds />); });
    expect(mocks.fetchAdminJson).toHaveBeenCalledWith(expect.stringContaining("/api/admin/ads?period=30d"));
    const text = container.textContent!;
    expect(text).toContain("Pubs lancées avec Vendeo42");
    expect(text).toContain("Pubs actives sur la période11");
    expect(text).toContain("Pubs actives en ce moment5");
    expect(text).toContain("Meta 40 · TikTok 2");
  });
  it("requests the new period when it changes and never shows zero on failure", async () => {
    mocks.fetchAdminJson.mockRejectedValue(new Error("x"));
    await act(async () => { root.render(<AdminAds />); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Aucune valeur n’est remplacée par un zéro");
    expect(container.querySelector(".admin-revenue-grid")).toBeNull();
    mocks.fetchAdminJson.mockResolvedValue({ ads: { total_launched: 1, total_launched_users: 1, active_now: 0, launched_in_period: 0, active_in_period: 0, by_platform: {}, active_in_period_by_platform: {}, by_status: {}, period: { ...period, preset: "90d" } } });
    await act(async () => { const select = container.querySelector("select")!; select.value = "90d"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(mocks.fetchAdminJson).toHaveBeenLastCalledWith(expect.stringContaining("period=90d"));
  });
});

describe("admin subscribers block", () => {
  const items = [
    { id: "1", user_id: "u1", plan: "starter", status: "active", state: "paying", current_period_start: "2026-10-20", current_period_end: "2026-11-19", trial_ends_at: null, user: { full_name: "Awa", email: "awa@example.com" } },
    { id: "2", user_id: "u2", plan: "starter", status: "past_due", state: "expired", current_period_start: "2026-09-01", current_period_end: "2026-09-30", trial_ends_at: null, user: { full_name: "Koffi", email: "koffi@example.com" } },
  ];
  it("lists in-progress subscribers by default and exposes counters for every subscription", async () => {
    mocks.fetchAdminJson.mockResolvedValue({ subscribers: { asOf: "2026-11-05T12:00:00Z", truncated: false, counts: { paying: 1, trial: 3, expired: 1, other: 0, total: 5 }, items } });
    await act(async () => { root.render(<AdminSubscribers />); });
    const text = container.textContent!;
    expect(text).toContain("Abonnés payants en cours1");
    expect(text).toContain("Essais gratuits en cours3");
    expect(text).toContain("5 abonnements au total");
    expect(text).toContain("Awa");
    expect(text).not.toContain("Koffi");
    const all = [...container.querySelectorAll("button")].find((b) => b.textContent === "Tous")!;
    await act(async () => { all.click(); });
    expect(container.textContent).toContain("Koffi");
  });
});

describe("admin transactions block", () => {
  it("shows totals, uncounted rows and individual transactions", async () => {
    mocks.fetchAdminJson.mockResolvedValue({ transactions: { asOf: "2026-11-05T12:00:00Z", truncated: false,
      summary: { currency: "XOF", subscriptions_xof: 4000, credits_xof: 1000, total_xof: 5000, subscription_count: 2, credit_count: 1, unverified: 1, pending: 2, failed: 0, free_credit_grants: 3 },
      items: [{ id: "p1", type: "subscription", user_id: "u1", status: "paid", amount_xof: 2000, credits: null, provider: "saspay", reference: "tx-123", plan: "starter", created_at: "2026-11-02T10:00:00Z", user: { full_name: "Awa", email: "awa@example.com" } }], series: [] } });
    await act(async () => { root.render(<AdminTransactions />); });
    const text = container.textContent!;
    expect(text).toContain("Total encaissé");
    expect(text).toMatch(/5.000 XOF/);
    expect(text).toContain("2 en attente");
    expect(text).toContain("1 à vérifier");
    expect(text).toContain("tx-123");
    expect(text).toContain("Payé");
  });
});
