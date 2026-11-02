export const CREDIT_PRICE_XOF = 2.5;
export const MIN_CREDITS = 200;

export const IMAGE_COSTS = {
  hd: { medium: 15, high: 38, xhigh: 113, max: 225 },
  full_hd: { medium: 23, high: 53, xhigh: 150, max: 338 },
  "2k": { medium: 30, high: 75, xhigh: 225, max: 450 },
  "4k": { medium: 53, high: 128, xhigh: 375, max: 750 },
} as const;

// Le Studio image utilise toujours le modèle avancé. Le tarif public est la
// grille de base multipliée par 4/3, ce qui donne 20 crédits pour une image
// standard (hd, qualité medium). Les autres résolutions/qualités restent
// proportionnelles. On multiplie avant de diviser pour éviter les erreurs
// d'arrondi flottant.
export function imageCreditCost(resolution: keyof typeof IMAGE_COSTS, quality: keyof typeof IMAGE_COSTS.hd) {
  const baseCost = IMAGE_COSTS[resolution][quality];
  return Math.ceil((baseCost * 4) / 3);
}

// Tarifs Studio validés : 750 crédits pour 25 s en 480p, 1 300 en 720p.
const VIDEO_RATE_PER_SECOND: Record<string, number> = { "480p": 30, "720p": 52 };
export function videoCreditCost(resolution: string, duration: number) {
  const rate = VIDEO_RATE_PER_SECOND[resolution];
  if (!rate) throw new Error("Cette résolution vidéo n’a pas de tarif Studio validé.");
  if (!Number.isInteger(duration) || duration <= 0) throw new Error("Durée vidéo invalide.");
  return duration * rate;
}

export function creditPrice(credits: number) {
  if (!Number.isInteger(credits) || credits < MIN_CREDITS) throw new Error("Le minimum est de 200 crédits.");
  return Math.round(credits * CREDIT_PRICE_XOF);
}
