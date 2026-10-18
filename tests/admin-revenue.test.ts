import { describe, expect, it } from "vitest";
import { readRevenue, summarizeRevenue, type RevenueRow } from "@/lib/admin-revenue";
const asOf = "2026-10-18T20:00:00.000Z";
const payment = (overrides: Partial<RevenueRow> = {}): RevenueRow => ({ id: "p", provider: "saspay", transaction_id: "tx1", plan: "starter", status: "approved", metadata: { amount_xof: 2000 }, created_at: "2026-10-01T00:00:00Z", ...overrides });
const credit = (overrides: Partial<RevenueRow> = {}): RevenueRow => ({ id: "c", kind: "purchase", operation: "credit_purchase", external_id: "tx2", status: "completed", metadata: { provider: "saspay", amount_xof: 500 }, created_at: "2026-10-07T20:45:16Z", ...overrides });
describe("recorded SaaS revenue", () => {
  it("adds only verified successful subscriptions and paid topups", () => {
    const summary = summarizeRevenue([payment(), payment({ status: "pending" }), payment({ status: "failed" })], [credit(), credit({ operation: "admin_grant", metadata: { amount_xof: 99999, provider: "admin_grant" } }), credit({ operation: "welcome_credits", metadata: { source: "signup" } }), credit({ kind: "debit", status: "refunded" }), credit({ status: "pending" })], asOf);
    expect(summary).toMatchObject({ subscriptions: 2000, studio: 500, total: 2500, currency: "XOF", complete: true, subscriptionPayments: 1, studioPayments: 1, firstRecordedAt: "2026-10-01T00:00:00Z" });
  });
  it("returns an honest zero for no recorded payments, not active subscription estimates", () => {
    expect(summarizeRevenue([], [], asOf)).toMatchObject({ total: 0, subscriptions: 0, studio: 0, firstRecordedAt: null });
  });
  it("deduplicates transaction IDs, not provider event IDs", () => {
    expect(summarizeRevenue([payment(), payment({ id: "redelivery" })], [credit(), credit({ id: "again" })], asOf)).toMatchObject({ total: 2500, subscriptionPayments: 1, studioPayments: 1 });
    expect(summarizeRevenue([payment()], [credit({ external_id: "tx1" })], asOf).complete).toBe(false);
  });
  it.each([
    { metadata: {} }, { metadata: { amount_xof: "2000" } }, { metadata: { amount_xof: -5 } }, { metadata: { amount_xof: 0 } }, { metadata: { amount_xof: Infinity } }, { metadata: { amount_xof: 1.5 } }, { metadata: { amount_xof: 2000, currency: "USD" } }, { provider: "fedapay" }, { transaction_id: null }, { plan: null }, { created_at: "bad" }, { status: "refunded" }, { created_at: "2027-01-01" },
  ])("withholds all totals when evidence is incomplete: %j", (overrides) => {
    expect(summarizeRevenue([payment(overrides)], [credit()], asOf)).toMatchObject({ complete: false, total: null, subscriptions: null, studio: null, unresolved: 1 });
  });
  it("never interprets a credit refund as a quantified cash refund", () => {
    expect(summarizeRevenue([], [credit({ kind: "debit", status: "refunded" })], asOf).total).toBe(0);
    expect(summarizeRevenue([], [credit({ kind: "refund" })], asOf).total).toBeNull();
  });
  it("reads beyond the first 1000 rows and keeps the snapshot and stable ordering", async () => {
    const calls: any[] = [];
    const records = Array.from({ length: 1001 }, (_, i) => credit({ id: `c${i}`, external_id: `tx${i}` }));
    const service = { from: (table: string) => {
      const q: any = {};
      for (const method of ["select", "lte", "order", "in"]) q[method] = (...args: any[]) => { calls.push([table, method, ...args]); return q; };
      q.range = async (start: number, end: number) => ({ data: table === "payment_events" ? [] : records.slice(start, end + 1), error: null });
      return q;
    } };
    expect(await readRevenue(service, asOf)).toMatchObject({ studio: 500500, studioPayments: 1001 });
    expect(calls).toContainEqual(["credit_transactions", "lte", "created_at", asOf]);
    expect(calls).toContainEqual(["credit_transactions", "order", "id", { ascending: true }]);
  });
  it("fails closed on any database error", async () => {
    const q: any = {}; for (const method of ["select", "lte", "order", "in"]) q[method] = () => q;
    q.range = async () => ({ data: [], error: { message: "private" } });
    await expect(readRevenue({ from: () => q }, asOf)).rejects.toThrow("revenue_unavailable");
  });
});
