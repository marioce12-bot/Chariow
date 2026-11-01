import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCache = vi.hoisted(() => ({ values: new Map<string, unknown>(), tags: new Map<string, string[]>() }));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>, keyParts: string[], options: { tags?: string[]; revalidate?: number }) => {
    const key = JSON.stringify(keyParts);
    mockCache.tags.set(key, options.tags ?? []);
    return async () => {
      if (mockCache.values.has(key)) return mockCache.values.get(key);
      const result = await fn();
      mockCache.values.set(key, result);
      return result;
    };
  },
  revalidateTag: (tag: string) => {
    for (const [key, tags] of mockCache.tags) if (tags.includes(tag)) mockCache.values.delete(key);
  },
}));
import { getCachedChariowAnalytics, invalidateChariowAnalytics } from "./analytics-cache";

const base = { userId: "u1", storeId: "s1", from: "2026-10-01", to: "2026-10-31" };
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => mockCache.values.clear());

describe("Chariow analytics cache", () => {
  it("isolates user, store, and date range while caching for 120 seconds", async () => {
    const load = vi.fn(async () => "same");
    await getCachedChariowAnalytics({ ...base, load });
    await getCachedChariowAnalytics({ ...base, userId: "u2", load });
    await getCachedChariowAnalytics({ ...base, storeId: "s2", load });
    await getCachedChariowAnalytics({ ...base, to: "2026-10-30", load });
    expect(load).toHaveBeenCalledTimes(4);
    expect(mockCache.tags.size).toBe(4);
  });

  it("deduplicates concurrent loads and allows invalidation to retry without caching stale work", async () => {
    const first = deferred<string>();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce("fresh");
    const a = getCachedChariowAnalytics({ ...base, load });
    const b = getCachedChariowAnalytics({ ...base, load });
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    invalidateChariowAnalytics(base.storeId);
    first.resolve("stale");
    await expect(Promise.all([a, b])).resolves.toEqual(["fresh", "fresh"]);
    expect(load).toHaveBeenCalledTimes(2);
    await expect(getCachedChariowAnalytics({ ...base, load: vi.fn(async () => "wrong") })).resolves.toBe("fresh");
  });

  it("bypasses fresh cache on forced refresh without replacing the cached value", async () => {
    await expect(getCachedChariowAnalytics({ ...base, load: async () => "cached" })).resolves.toBe("cached");
    const force = vi.fn(async () => "manual");
    await expect(getCachedChariowAnalytics({ ...base, forceRefresh: true, load: force })).resolves.toBe("manual");
    expect(force).toHaveBeenCalledOnce();
    await expect(getCachedChariowAnalytics({ ...base, load: async () => "wrong" })).resolves.toBe("cached");
  });

  it("deduplicates forced requests and retries them if a sale invalidates work in flight", async () => {
    const first = deferred<string>();
    const load = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce("fresh-forced");
    const a = getCachedChariowAnalytics({ ...base, forceRefresh: true, load });
    const b = getCachedChariowAnalytics({ ...base, forceRefresh: true, load });
    expect(load).toHaveBeenCalledTimes(1);
    invalidateChariowAnalytics(base.storeId);
    first.resolve("stale-forced");
    await expect(Promise.all([a, b])).resolves.toEqual(["fresh-forced", "fresh-forced"]);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
