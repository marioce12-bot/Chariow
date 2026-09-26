export const CREDIT_PRICE_XOF = 2.5;
export const MIN_CREDITS = 200;

export const IMAGE_COSTS = {
  hd: { medium: 15, high: 38, xhigh: 113, max: 225 },
  full_hd: { medium: 23, high: 53, xhigh: 150, max: 338 },
  "2k": { medium: 30, high: 75, xhigh: 225, max: 450 },
  "4k": { medium: 53, high: 128, xhigh: 375, max: 750 },
} as const;

export function imageCreditCost(resolution: keyof typeof IMAGE_COSTS, quality: keyof typeof IMAGE_COSTS.hd) {
  return IMAGE_COSTS[resolution][quality];
}

// Coût vidéo par seconde selon la résolution réellement choisie.
const VIDEO_RATE_PER_SECOND: Record<string, number> = { "480p": 15, "720p": 25, "1080p": 38 };
export function videoCreditCost(resolution: string, duration: number) {
  return duration * (VIDEO_RATE_PER_SECOND[resolution] ?? 38);
}

export function creditPrice(credits: number) {
  if (!Number.isInteger(credits) || credits < MIN_CREDITS) throw new Error("Le minimum est de 200 crédits.");
  return Math.round(credits * CREDIT_PRICE_XOF);
}
