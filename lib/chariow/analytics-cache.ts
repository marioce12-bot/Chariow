import { unstable_cache, revalidateTag } from "next/cache";

const inFlight = new Map<string, Promise<unknown>>();
const generations = new Map<string, number>();
const tagFor = (storeId: string) => `chariow-analytics:${storeId}`;

function keyFor(userId: string, storeId: string, from: string, to: string, forceRefresh = false) {
  return JSON.stringify([userId, storeId, from, to, forceRefresh ? "force" : "cache"]);
}

class RetryAfterInvalidation extends Error {}

/** Cache a serializable analytics result; callers must authorize store ownership first. */
export async function getCachedChariowAnalytics<T>(args: {
  userId: string;
  storeId: string;
  from: string;
  to: string;
  forceRefresh?: boolean;
  load: () => Promise<T>;
}): Promise<T> {
  const { userId, storeId, from, to, forceRefresh, load } = args;
  const identity = keyFor(userId, storeId, from, to, forceRefresh);
  const active = inFlight.get(identity);
  if (active) return active as Promise<T>;

  const work = (async () => {
    for (;;) {
      const generation = generations.get(storeId) ?? 0;
      if (forceRefresh) {
        const result = await load();
        if ((generations.get(storeId) ?? 0) !== generation) continue;
        return result;
      }
      const cached = unstable_cache(
        async () => {
          const result = await load();
          // Throwing prevents Next from storing a result computed across invalidation.
          if ((generations.get(storeId) ?? 0) !== generation) throw new RetryAfterInvalidation();
          return result;
        },
        ["chariow-analytics-v1", userId, storeId, from, to, String(generation)],
        { revalidate: 120, tags: [tagFor(storeId)] },
      );
      try {
        return await cached() as T;
      } catch (error) {
        if (!(error instanceof RetryAfterInvalidation)) throw error;
      }
    }
  })();
  inFlight.set(identity, work);
  try { return await work; }
  finally { if (inFlight.get(identity) === work) inFlight.delete(identity); }
}

export function invalidateChariowAnalytics(storeId: string): void {
  generations.set(storeId, (generations.get(storeId) ?? 0) + 1);
  revalidateTag(tagFor(storeId));
  for (const key of inFlight.keys()) {
    // Keys are JSON tuples; store ID is position 1.
    try { if (JSON.parse(key)[1] === storeId) inFlight.delete(key); } catch { /* defensive */ }
  }
}
