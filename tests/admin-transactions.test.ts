import { describe, expect, it } from "vitest";
import { buildTransactions, type CreditRow, type PaymentRow } from "@/lib/admin-transactions";
import { classifySubscription, type SubscriptionRow } from "@/lib/admin-subscribers";

const period = { startAt: "2026-11-01T00:00:00.000Z", endAt: "2026-11-05T23:59:59.999Z", timeZone: "UTC" };
const pay = (over: Partial<PaymentRow> = {}): PaymentRow => ({ id: "p1", user_id: "u1", provider: "saspay", transaction_id: "tx1", plan: "starter", status: "approved", metadata: { amount_xof: 2000, currency: "XOF" }, created_at: "2026-11-02T10:00:00Z", ...over });
const credit = (over: Partial<CreditRow> = {}): CreditRow => ({ id: "c1", user_id: "u1", kind: "purchase", operation: "credit_purchase", external_id: "ext1", status: "completed", credits: 500, metadata: { amount_xof: 1000, provider: "saspay" }, created_at: "2026-11-03T10:00:00Z", ...over });

describe("admin transactions ledger", () => {
  it("totals confirmed subscription and credit payments only", () => {
    const r = buildTransactions([pay(), pay({ id: "p2", transaction_id: "tx2", status: "pending" }), pay({ id: "p3", transaction_id: "tx3", status: "failed" })], [credit(), credit({ id: "c2", operation: "admin_grant", metadata: { provider: "admin_grant" } }), credit({ id: "c3", kind: "debit" })], period);
    expect(r.summary).toMatchObject({ subscriptions_xof: 2000, credits_xof: 1000, total_xof: 3000, subscription_count: 1, credit_count: 1, pending: 1, failed: 1, unverified: 0, free_credit_grants: 1 });
    expect(r.items).toHaveLength(4);
    expect(r.series).toEqual([{ date: "2026-11-02", subscriptions: 2000, credits: 0, total: 2000 }, { date: "2026-11-03", subscriptions: 0, credits: 1000, total: 1000 }]);
  });
  it("never totals unverifiable payments", () => {
    const r = buildTransactions([pay({ provider: "fedapay" }), pay({ id: "p2", transaction_id: null }), pay({ id: "p3", transaction_id: "t3", metadata: {} })], [credit({ metadata: { amount_xof: 10, provider: "saspay", currency: "USD" } })], period);
    expect(r.summary.total_xof).toBe(0);
    expect(r.summary.unverified).toBe(4);
  });
  it("counts a re-delivered webhook once, using the first recording", () => {
    const r = buildTransactions([pay(), pay({ id: "p2", created_at: "2026-11-04T10:00:00Z" })], [], period);
    expect(r.summary.subscriptions_xof).toBe(2000);
    expect(r.items).toHaveLength(1);
    // A re-delivery inside the range of a payment recorded before the range is not new revenue.
    const early = buildTransactions([pay({ created_at: "2026-10-01T10:00:00Z" }), pay({ id: "p2", created_at: "2026-11-02T10:00:00Z" })], [], period);
    expect(early.summary.total_xof).toBe(0);
  });
  it("flags a replay with a different amount instead of summing it", () => {
    const r = buildTransactions([pay(), pay({ id: "p2", metadata: { amount_xof: 5000 } })], [], period);
    expect(r.summary.subscriptions_xof).toBe(2000);
    expect(r.summary.unverified).toBe(1);
  });
  it("ignores rows outside the period and payment events without a plan", () => {
    const r = buildTransactions([pay({ created_at: "2026-10-30T10:00:00Z" }), pay({ id: "p2", transaction_id: "t2", plan: null })], [], period);
    expect(r.items).toHaveLength(0);
  });
});

describe("subscriber classification", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  const row = (over: Partial<SubscriptionRow>): SubscriptionRow => ({ id: "s", user_id: "u", plan: "starter", status: "active", current_period_start: "2026-10-20", current_period_end: "2026-11-19", trial_active: false, trial_ends_at: null, created_at: "2026-10-01", ...over });
  it("distinguishes paying, trial, expired and other", () => {
    expect(classifySubscription(row({}), now)).toBe("paying");
    expect(classifySubscription(row({ current_period_end: "2026-11-05" }), now)).toBe("paying");
    expect(classifySubscription(row({ current_period_end: "2026-11-04" }), now)).toBe("expired");
    expect(classifySubscription(row({ status: "trialing", trial_active: true, trial_ends_at: "2026-11-08T00:00:00Z" }), now)).toBe("trial");
    expect(classifySubscription(row({ status: "trialing", trial_active: true, trial_ends_at: "2026-11-01T00:00:00Z" }), now)).toBe("expired");
    expect(classifySubscription(row({ status: "past_due" }), now)).toBe("expired");
    expect(classifySubscription(row({ status: "canceled" }), now)).toBe("other");
  });
});
