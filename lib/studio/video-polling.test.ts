import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isTerminalStudioVideoStatus,
  normalizeStudioVideoStatus,
  startStudioVideoPolling,
} from "./video-polling";

type Status = { id: string; status: string; contentUrl?: string | null; progress?: number };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Studio video polling", () => {
  it("normalizes the API jobId and reserves 100% for a final media URL", () => {
    expect(normalizeStudioVideoStatus("fallback", { jobId: "job-7", status: "processing", progress: 100 }))
      .toEqual({ id: "job-7", status: "processing", contentUrl: null, progress: 99 });
    expect(normalizeStudioVideoStatus("fallback", { jobId: "job-7", status: "completed", progress: 100, contentUrl: null })?.progress)
      .toBe(99);
    expect(normalizeStudioVideoStatus("fallback", { jobId: "job-7", status: "completed", progress: 82, contentUrl: "https://cdn.example/video.mp4" })?.progress)
      .toBe(100);
    expect(normalizeStudioVideoStatus("fallback", { jobId: "job-7", status: "READY", progress: 40, contentUrl: "https://cdn.example/ready.mp4" }))
      .toMatchObject({ id: "job-7", status: "ready", progress: 100 });
    expect(normalizeStudioVideoStatus("fallback", { status: "processing" })?.id).toBe("fallback");
    expect(normalizeStudioVideoStatus("fallback", null)).toBeNull();
  });

  it.each(["ready", "completed", "failed", "cancelled"])("treats %s as terminal", (status) => {
    expect(isTerminalStudioVideoStatus(status)).toBe(true);
  });

  it("waits 30 seconds after each response, prevents overlap, and stops when ready", async () => {
    vi.useFakeTimers();
    const first = deferred<Status>();
    const fetchStatus = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce({ id: "job-1", status: "processing", progress: 30 })
      .mockResolvedValueOnce({ id: "job-1", status: "ready", contentUrl: "https://cdn.example/final.mp4" });
    const onStatus = vi.fn();
    const onError = vi.fn();
    const polling = startStudioVideoPolling({ fetchStatus, onStatus, onError });

    expect(fetchStatus).toHaveBeenCalledTimes(1);
    polling.refresh();
    expect(fetchStatus).toHaveBeenCalledTimes(1);

    first.resolve({ id: "job-1", status: "processing", progress: 10 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetchStatus).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchStatus).toHaveBeenCalledTimes(3);
    expect(onStatus).toHaveBeenCalledTimes(3);
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchStatus).toHaveBeenCalledTimes(3);
    polling.stop();
  });

  it.each(["failed", "cancelled"])("stops polling after %s", async (status) => {
    vi.useFakeTimers();
    const fetchStatus = vi.fn().mockResolvedValue({ id: "job-2", status });
    const polling = startStudioVideoPolling({ fetchStatus, onStatus: vi.fn() });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    polling.stop();
  });
});
