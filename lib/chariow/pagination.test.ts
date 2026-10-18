import { describe, expect, it, vi } from "vitest";
import { collectChariowPages, collectionRows } from "./pagination";
import { chariowSaleRows } from "./sales-rows";
describe("Chariow collection coverage", () => {
  it("reads nested envelopes and follows cursors, deduplicating stable IDs", async () => {
    const call = vi.fn().mockResolvedValueOnce({ data: [{ id: "a" }], meta: { next_cursor: "next" } }).mockResolvedValueOnce({ data: [{ id: "a" }, { id: "b" }], meta: { next_cursor: null } });
    const result = await collectChariowPages(call, { start_date: "2026-10-01" });
    expect(result.data).toHaveLength(2); expect(result.coverage.complete).toBe(true);
    expect(call.mock.calls[1][0]).toEqual({ per_page: 100, cursor: "next", start_date: "2026-10-01" });
    expect(collectionRows({ data: { items: [{ id: "a" }] } })).toHaveLength(1);
  });
  it("does not claim complete coverage at an unexplained full page", async () => {
    const result = await collectChariowPages(async () => ({ data: Array.from({ length: 100 }, (_, id) => ({ id })) }));
    expect(result.coverage.complete).toBe(false); expect(result.coverage.reason).toBeTruthy();
  });
  it("stops repeated cursors and preserves explicit partial status", async () => {
    const result = await collectChariowPages(async () => ({ data: [{ id: "a" }], meta: { next_cursor: "same" } }));
    expect(result.coverage.complete).toBe(false); expect(result.coverage.pages).toBe(2);
  });
  it("preserves a useful partial result when a later page fails", async () => {
    const call = vi.fn().mockResolvedValueOnce({ data: [{ id: "a" }], next_cursor: "next" }).mockRejectedValueOnce(new Error("timeout"));
    const result = await collectChariowPages(call); expect(result.coverage.complete).toBe(false); expect(result.data).toHaveLength(1);
  });
});
describe("sale amount provenance", () => {
  it("does not manufacture zero amounts, dates or customer identifiers", () => {
    const [row] = chariowSaleRows("store", [{ id: "sale" }]);
    expect(row.amount).toBeNull(); expect(row.net_amount).toBeNull(); expect(row.occurred_at).toBeNull(); expect(row).not.toHaveProperty("customer_id");
  });
  it("preserves observed zero net and actual paid amounts", () => {
    const [row] = chariowSaleRows("store", [{ id: "sale", amount: { value: "100", currency: "XOF" }, settlement: { amount: { value: 0 } }, customer: { id: "customer" } }]);
    expect(row.amount).toBe(100); expect(row.net_amount).toBe(0); expect(row.raw_payload).toHaveProperty("customer.id", "customer");
  });
});
