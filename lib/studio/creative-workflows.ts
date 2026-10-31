// Capacités réelles des workflows de génération + typologie des produits.
// Ce module est importé à la fois par le backend (validation stricte) et par le
// front (options affichées) : c'est la source de vérité unique, pour ne plus
// jamais afficher une option qui serait ensuite transformée silencieusement
// côté serveur.
//
// Contrat de l'endpoint Seedance 2.5 reference-to-video vérifié dans son schéma Fal.

export const VIDEO_RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];

export const VIDEO_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];

// Seedance 2.5 accepte des vidéos native audio de 4 à 30 secondes.
export const VIDEO_DURATIONS = [20, 25, 30] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

export const VIDEO_CAPABILITIES = {
  resolutions: VIDEO_RESOLUTIONS,
  aspectRatios: VIDEO_ASPECT_RATIOS,
  durations: VIDEO_DURATIONS,
  referenceModes: ["image"] as const,
  maxDurationSeconds: 30,
} as const;

export function isSupportedVideoResolution(value: string): value is VideoResolution {
  return (VIDEO_RESOLUTIONS as readonly string[]).includes(value);
}

export function isSupportedVideoAspectRatio(value: string): value is VideoAspectRatio {
  return (VIDEO_ASPECT_RATIOS as readonly string[]).includes(value);
}

export function isSupportedVideoDuration(value: number): value is VideoDuration {
  return (VIDEO_DURATIONS as readonly number[]).includes(value);
}

export const PRODUCT_TYPES = [
  "ebook",
  "formation",
  "saas",
  "mode",
  "food",
  "physique",
  "service",
  "evenement",
  "autre",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

const TYPE_KEYWORDS: Record<Exclude<ProductType, "autre">, string[]> = {
  ebook: ["ebook", "e-book", "livre", "book", "guide", "pdf", "roman", "manuel"],
  formation: ["formation", "cours", "course", "coaching", "masterclass", "programme", "académie", "academy", "bootcamp", "tuto"],
  saas: ["logiciel", "software", "saas", "application", "app", "outil", "abonnement", "plateforme", "souscription"],
  mode: ["vêtement", "vetement", "robe", "t-shirt", "tshirt", "chemise", "chaussure", "sneaker", "sac", "mode", "fashion", "habit", "pantalon", "jupe"],
  food: ["restaurant", "nourriture", "food", "repas", "plat", "recette", "cuisine", "burger", "pizza", "dessert", "boisson", "jus"],
  physique: ["produit", "objet", "accessoire", "électronique", "cosmétique", "montre", "bijou", "gadget", "bouteille", "pack", "coffret"],
  service: ["service", "consultation", "accompagnement", "audit", "réservation", "coiffure", "massage", "conseil", "prestation"],
  evenement: ["événement", "evenement", "conférence", "conference", "concert", "webinaire", "atelier", "show", "soirée", "soiree", "festival"],
};

export function inferProductType(name: string, description?: string): ProductType {
  const haystack = `${name} ${description ?? ""}`.toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return type as ProductType;
  }
  return "autre";
}
