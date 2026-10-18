/** Cosmetic estimate only: completion must come from a successful API response. */
export function estimatedLaunchProgress(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(95, Math.floor(95 * (1 - Math.exp(-elapsedMs / 12_000))));
}
