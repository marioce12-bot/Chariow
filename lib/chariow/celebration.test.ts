import { describe, expect, it } from "vitest";
import { confirmedCandidates } from "./celebration";

describe("confirmedCandidates", () => {
  const now = Date.parse("2026-10-19T12:00:00.000Z");
  it("accepts only confirmed sales with durable IDs and valid non-future timestamps", () => {
    const result = confirmedCandidates([
      { id: "paid", status: "paid", created_at: "2026-10-19T11:00:00Z" },
      { id: "done", status: "COMPLETED", createdAt: "2026-10-19T12:00:00Z" },
      { id: "settled", status: "settled", settled_at: "2026-10-19T11:59:59Z" },
      { id: "pending", status: "pending", created_at: "2026-10-19T11:00:00Z" },
      { id: "refund", status: "refunded", created_at: "2026-10-19T11:00:00Z" },
      { id: "bad-date", status: "paid", created_at: "not a date" },
      { id: "future", status: "paid", created_at: "2026-10-19T12:00:01Z" },
      { status: "paid", created_at: "2026-10-19T11:00:00Z" },
      { id: "", status: "paid", created_at: "2026-10-19T11:00:00Z" },
    ], now);
    expect(result.map((x) => x.id)).toEqual(["paid", "done", "settled"]);
    expect(result[1].occurred_at).toBe("2026-10-19T12:00:00.000Z");
  });
  it("retains distinct durable IDs even when timestamp is identical", () => {
    const timestamp = "2026-10-19T12:00:00Z";
    expect(confirmedCandidates([
      { id: "order-a", status: "paid", created_at: timestamp },
      { id: "order-b", status: "paid", created_at: timestamp },
    ], now)).toHaveLength(2);
  });
});
