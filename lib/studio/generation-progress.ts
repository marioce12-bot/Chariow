export const MAX_ESTIMATED_GENERATION_PROGRESS = 95;

/** Progression indicative uniquement : le endpoint ne fournit aucun événement intermédiaire. */
export function estimatedGenerationProgress(elapsedMs: number): number {
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  // Démarre à 3 %, avance vite au début puis ralentit jusqu'au plafond.
  return Math.min(MAX_ESTIMATED_GENERATION_PROGRESS, Math.floor(3 + 92 * (1 - Math.exp(-elapsed / 18_000))));
}

/** Lance une progression de présentation et retourne son nettoyage. */
export function startEstimatedGenerationProgress(
  onProgress: (percentage: number) => void,
  intervalMs = 500,
): () => void {
  const startedAt = Date.now();
  const timer = setInterval(() => onProgress(estimatedGenerationProgress(Date.now() - startedAt)), intervalMs);
  return () => clearInterval(timer);
}
