// Configuration centralisée des plans Vendeo.
// Toute logique de prix, durée, quota IA ou accès aux réseaux pub doit passer par ce fichier
// plutôt que d'écrire des valeurs "en dur" dans les routes API ou les composants.

export const PLAN_CONFIG = {
  eco: {
    label: "Éco",
    amount: 2900,
    periodDays: 15,
    messagesLimit: 100,
    // Restriction volontairement plus fine que "meta" : uniquement Facebook, pas Instagram.
    adPlatforms: ["facebook"] as const,
  },
  starter: {
    label: "Starter",
    amount: 5000,
    periodDays: 30,
    messagesLimit: 400,
    adPlatforms: ["facebook", "instagram", "tiktok", "whatsapp"] as const,
  },
  pro: {
    label: "Pro",
    amount: 9000,
    periodDays: 30,
    messagesLimit: 1200,
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

export function planMessagesLimit(plan: PlanId) {
  return PLAN_CONFIG[plan].messagesLimit;
}

// Vérifie si un réseau pub est inclus dans le plan de l'utilisateur.
// Utilisé à la fois pour l'UI (afficher "non inclus dans ton plan") et pour bloquer
// côté serveur au moment du lancement d'une campagne.
export function isAdPlatformAllowed(plan: PlanId, platform: AdPlatform) {
  return (PLAN_CONFIG[plan].adPlatforms as readonly string[]).includes(platform);
}

// Calcule la date de fin de période d'un abonnement à partir d'aujourd'hui.
// Éco : 15 jours glissants. Starter / Pro : comportement existant conservé
// (fin du mois calendaire en cours), pour ne rien changer aux abonnements déjà en place.
export function computePeriodEnd(plan: PlanId, now: Date): string {
  if (plan === "eco") {
    const end = new Date(now.getTime());
    end.setUTCDate(end.getUTCDate() + PLAN_CONFIG.eco.periodDays);
    return end.toISOString().slice(0, 10);
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

// Pour le lancement d'une campagne Meta : quelles plateformes Meta ("publisher_platforms")
// transmettre à l'API. Le plan Éco est restreint à Facebook seul (pas Instagram).
export function metaPublisherPlatforms(plan: PlanId): string[] {
  return plan === "eco" ? ["facebook"] : ["facebook", "instagram"];
}
