import { describe, expect, it } from "vitest";
import { formatDuration } from "./AdminSections";

describe("formatDuration", () => {
  it("formats seconds, minutes and hours consistently", () => {
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(125)).toBe("2 min 05 s");
    expect(formatDuration(3660)).toBe("1 h 01 min");
  });

  it("normalizes missing, negative and non-finite durations", () => {
    expect(formatDuration()).toBe("0 s");
    expect(formatDuration(-2)).toBe("0 s");
    expect(formatDuration(Number.NaN)).toBe("0 s");
  });
});
