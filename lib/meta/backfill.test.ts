import { describe, expect, it } from "vitest";
import { initialBackfillDate, nextBackfillChunk } from "./backfill";

describe("Meta backfill date windows", () => {
  it("starts twelve calendar months before today", () => {
    expect(initialBackfillDate("2026-10-11")).toBe("2025-10-11");
  });

  it("creates inclusive chunks no longer than thirty days", () => {
    expect(nextBackfillChunk("2026-01-01", "2026-02-15")).toEqual({
      from: "2026-01-01", to: "2026-01-30", nextFrom: "2026-01-31", done: false,
    });
  });

  it("ends the final chunk at today", () => {
    expect(nextBackfillChunk("2026-02-01", "2026-02-15")).toEqual({
      from: "2026-02-01", to: "2026-02-15", nextFrom: "2026-02-16", done: true,
    });
  });

  it("returns null after the last date and rejects invalid chunk sizes", () => {
    expect(nextBackfillChunk("2026-02-16", "2026-02-15")).toBeNull();
    expect(() => nextBackfillChunk("2026-02-01", "2026-02-15", 0)).toThrow();
  });
});
