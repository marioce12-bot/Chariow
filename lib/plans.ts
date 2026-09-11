// Configuration centralisée des plans Vendeo.
// Deux plans : Vendeo (2 000 XOF/mois, 1 boutique) et Vendeo Premium
// (3 000 XOF/mois, 3 boutiques), avec 7 jours d'essai gratuit à l'inscription
// (sur le plan Vendeo standard). Toute logique de prix, de durée ou de
// limites doit passer par ce fichier plutôt que d'écrire des valeurs
// "en dur" dans les routes API ou les composants.
//
// Il n'y a plus de quota de messages IA : tant que l'essai de 7 jours ou
// l'abonnement est actif, l'usage de l'assistant IA est illimité (voir
// consume_message_quota côté base de données).

export const PLAN_CONFIG = {
  starter: {
    label: "Vendeo",
    amount: 2000,
    periodDays: 30,
    maxStores: 1,
    adPlatforms: ["facebook", "instagram", "tiktok", "whatsapp", "pinterest", "linkedin", "google"] as const,
  },
  premium: {
    label: "Vendeo Premium",
    amount: 3000,
    periodDays: 30,
    maxStores: 3,
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

export function planMaxStores(plan: PlanId) {
  return PLAN_CONFIG[plan].maxStores;
}

// Lit le plan actif de l'utilisateur et retourne le nombre de boutiques
// autorisées. Centralisé ici pour que /api/stores, /api/integrations/chariow/
// connect et /connect/check restent cohérents entre eux.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveUserMaxStores(supabase: any, userId: string): Promise<number> {
  const { data } = await supabase.from("subscriptions").select("plan").eq("user_id", userId).maybeSingle();
  const plan = isPlanId(data?.plan) ? data.plan : "starter";
  return planMaxStores(plan);
}

// Les deux plans incluent actuellement tous les réseaux pub : cette
// fonction est conservée pour l'UI de verrouillage par plateforme, au cas où
// un plan futur restreindrait certains réseaux.
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
