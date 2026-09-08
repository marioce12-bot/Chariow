// Configuration centralisée du plan Vendeo.
// Un seul abonnement, un seul prix : 2 000 XOF / mois, avec 7 jours d'essai
// gratuit à l'inscription. Toute logique de prix ou de durée doit passer par
// ce fichier plutôt que d'écrire des valeurs "en dur" dans les routes API ou
// les composants.
//
// Il n'y a plus de quota de messages IA : tant que l'essai de 7 jours ou
// l'abonnement est actif, l'usage de l'assistant IA est illimité (voir
// consume_message_quota côté base de données).

export const PLAN_CONFIG = {
  starter: {
    label: "Vendeo",
    amount: 2000,
    periodDays: 30,
    adPlatforms: ["facebook", "instagram", "tiktok", "whatsapp", "pinterest", "linkedin", "google"] as const,
  },
} as const;

export type PlanId = keyof typeof PLAN_CONFIG;
export type AdPlatform =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "whatsapp"
  | "pinterest"
  | "linkedin"
  | "google";

export const PLAN_IDS = Object.keys(PLAN_CONFIG) as PlanId[];

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as string[]).includes(value);
}

export function planAmount(plan: PlanId) {
  return PLAN_CONFIG[plan].amount;
}

// Un seul plan existe désormais et il inclut tous les réseaux pub : cette
// fonction est conservée pour ne pas casser les appels existants (UI de
// verrouillage par plateforme), mais elle retourne toujours vrai en pratique.
export function isAdPlatformAllowed(plan: PlanId, platform: AdPlatform) {
  return (PLAN_CONFIG[plan].adPlatforms as readonly string[]).includes(platform);
}

// Calcule la date de fin de période d'un abonnement à partir d'aujourd'hui
// (fin du mois calendaire en cours).
export function computePeriodEnd(_plan: PlanId, now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

// Pour le lancement d'une campagne Meta : quelles plateformes Meta
// ("publisher_platforms") transmettre à l'API. Le plan unique inclut
// Facebook et Instagram.
export function metaPublisherPlatforms(_plan: PlanId): string[] {
  return ["facebook", "instagram"];
}
