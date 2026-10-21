import { describe, expect, it, vi } from "vitest";
import { estimatedGenerationProgress, MAX_ESTIMATED_GENERATION_PROGRESS, startEstimatedGenerationProgress } from "./generation-progress";

describe("estimatedGenerationProgress", () => {
  it("starts low and rises monotonically while remaining below completion", () => {
    const values = [0, 1_000, 10_000, 60_000, 1_000_000].map(estimatedGenerationProgress);
    expect(values[0]).toBeGreaterThan(0);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(Math.max(...values)).toBe(MAX_ESTIMATED_GENERATION_PROGRESS);
    expect(values).not.toContain(100);
  });

  it("handles invalid and negative durations safely", () => {
    expect(estimatedGenerationProgress(-10)).toBe(estimatedGenerationProgress(0));
    expect(estimatedGenerationProgress(Number.NaN)).toBe(estimatedGenerationProgress(0));
  });

  it("can stop its interval", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const stop = startEstimatedGenerationProgress(callback, 100);
    vi.advanceTimersByTime(100);
    expect(callback).toHaveBeenCalledTimes(1);
    stop();
    vi.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
