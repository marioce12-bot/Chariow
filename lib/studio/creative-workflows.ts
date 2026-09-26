// Capacités réelles des workflows de génération + typologie des produits.
// Ce module est importé à la fois par le backend (validation stricte) et par le
// front (options affichées) : c'est la source de vérité unique, pour ne plus
// jamais afficher une option qui serait ensuite transformée silencieusement
// côté serveur.
//
// IMPORTANT : n'ajoute pas ici une valeur que le modèle sous-jacent ne produit
// pas réellement. Une durée de 20/30/40 s ou un format 21:9 devront passer par
// un workflow de composition/extension multi-segments, pas par une fausse
// valeur envoyée au modèle.

export const VIDEO_RESOLUTIONS = ["1080p"] as const;
export type VideoResolution = (typeof VIDEO_RESOLUTIONS)[number];

export const VIDEO_ASPECT_RATIOS = ["16:9", "9:16"] as const;
export type VideoAspectRatio = (typeof VIDEO_ASPECT_RATIOS)[number];

// Durées (en secondes) réellement produites nativement par fal-ai/ltx-2.3.
export const VIDEO_DURATIONS = [6, 8, 10] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

export const VIDEO_CAPABILITIES = {
  resolutions: VIDEO_RESOLUTIONS,
  aspectRatios: VIDEO_ASPECT_RATIOS,
  durations: VIDEO_DURATIONS,
  // Le modèle image-to-video de ltx-2.3 utilise l'image d'entrée comme PREMIER
  // FRAME (point de départ). Il n'a pas de mode "référence" distinct qui
  // reconstruirait la scène en gardant seulement l'identité du produit.
  referenceModes: ["image"] as const,
  maxDurationSeconds: 10,
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