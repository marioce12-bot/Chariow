// Limiteur de débit en mémoire (fenêtre fixe), par instance serverless : c'est une protection « best effort »,
// comme celle déjà utilisée par /api/attribution/touch. Pour une vraie protection, ajouter les règles du pare-feu Vercel.

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// Retourne true si la requête doit être refusée.
export function rateLimit(key: string, limit: number, windowMs = 60_000, now = Date.now()): boolean {
  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
  }
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
