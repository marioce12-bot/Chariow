import type { StudioProductInput } from "./product-prompt";

export type ProductCategory =
  | "ebook"
  | "formation"
  | "mode"
  | "food"
  | "beaute"
  | "service"
  | "produit_physique"
  | "autre";

export type CreativeBrief = {
  objective: string;
  productType: ProductCategory;
  targetAudience: string;
  visualStyle: string;
  mood: string;
  advertisingAngle: string;
  headlineDirection: string;
  composition: string;
  environment: string;
  lighting: string;
  cameraDirection: string;
  productTreatment: string;
  typographyDirection: string;
  callToAction: string;
  format: "square" | "landscape" | "portrait";
  constraints: string[];
  userRequest: string;
};

// Détection du type de produit à partir du nom/description Chariow (aucune
// saisie supplémentaire demandée à l'utilisateur). Les listes de mots-clés
// sont volontairement larges (FR + variantes courantes) plutôt que
// exhaustives : un faux négatif retombe simplement sur la catégorie "autre",
// qui reste une direction créative neutre et sûre.
const CATEGORY_KEYWORDS: Array<{ category: ProductCategory; keywords: RegExp }> = [
  { category: "ebook", keywords: /\b(e-?book|ebook|livre num[eé]rique|guide pdf|pdf|livret)\b/i },
  { category: "formation", keywords: /\b(formation|cours|masterclass|coaching|atelier|bootcamp|tutoriel|programme d.?accompagnement)\b/i },
  { category: "mode", keywords: /\b(v[eê]tement|robe|chaussure|sac[a-z]*|mode|t-?shirt|pantalon|basket|accessoire de mode|bijou)\b/i },
  { category: "food", keywords: /\b(recette|restaurant|plat|g[aâ]teau|p[aâ]tisserie|boisson|snack|food|cuisine|traiteur)\b/i },
  { category: "beaute", keywords: /\b(cosm[eé]tique|beaut[eé]|cr[eè]me|parfum|maquillage|skincare|soin[s]? (visage|peau|cheveux))\b/i },
  { category: "service", keywords: /\b(service|consultation|accompagnement|prestation|abonnement de service|conciergerie)\b/i },
];

export function detectProductCategory(product: StudioProductInput | null, userPrompt: string): ProductCategory {
  const haystack = `${product?.name ?? ""} ${product?.description ?? ""} ${userPrompt}`.toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.test(haystack)) return category;
  }
  if (product?.imageUrl) return "produit_physique";
  return "autre";
}

// Mots-clés de mood/style que l'utilisateur emploie souvent dans son brief
// libre. Quand présents, ils priment sur le mood par défaut de la catégorie
// (l'intention explicite de l'utilisateur passe avant le gabarit générique).
const MOOD_KEYWORDS: Array<{ pattern: RegExp; mood: string }> = [
  { pattern: /\b(intime|chaleureux|doux|f[eé]minin)\b/i, mood: "intime et chaleureux" },
  { pattern: /\b(luxe|luxueux|haut de gamme|premium)\b/i, mood: "premium et sophistiqué" },
  { pattern: /\b(minimaliste|[eé]pur[eé]|sobre)\b/i, mood: "minimaliste et épuré" },
  { pattern: /\b(color[eé]|vif|dynamique|[eé]nergique)\b/i, mood: "dynamique et coloré" },
  { pattern: /\b(sombre|dark|mystérieux|nocturne)\b/i, mood: "sombre et dramatique" },
  { pattern: /\b(festif|joyeux|fun)\b/i, mood: "festif et joyeux" },
  { pattern: /\b([eé]l[eé]gant|chic)\b/i, mood: "élégant et raffiné" },
];

function detectMoodOverride(userPrompt: string): string | null {
  for (const { pattern, mood } of MOOD_KEYWORDS) {
    if (pattern.test(userPrompt)) return mood;
  }
  return null;
}

export function buildCreativeBrief(
  userPrompt: string,
  product: StudioProductInput | null,
  hasReference: boolean,
  format: "square" | "landscape" | "portrait" = "square",
): CreativeBrief {
  const productType = detectProductCategory(product, userPrompt);
  const template = CATEGORY_TEMPLATES[productType];
  const moodOverride = detectMoodOverride(userPrompt);
  const productName = product?.name?.trim();

  const constraints: string[] = [
    "Aucun texte flou, illisible ou mal orthographié.",
    "N'invente ni prix, ni logo, ni promesse absents des informations fournies.",
  ];
  if (hasReference) {
    constraints.push(
      productType === "ebook"
        ? "Conserve fidèlement la couverture réelle fournie (design, titre, couleurs, proportions) sans en inventer une nouvelle version."
        : "Conserve fidèlement l'apparence réelle du produit fourni (forme, couleurs, détails) sans le déformer ni le remplacer par une version imaginaire.",
    );
  }

  return {
    objective: "conversion",
    productType,
    targetAudience: template.targetAudience,
    visualStyle: template.visualStyle,
    mood: moodOverride ?? template.mood,
    advertisingAngle: template.advertisingAngle,
    headlineDirection: productName ? `Met en avant le nom « ${productName} » sans le surcharger de texte additionnel.` : "Laisse un espace négatif clair pour un futur message publicitaire.",
    composition: template.composition,
    environment: template.environment,
    lighting: template.lighting,
    cameraDirection: template.cameraDirection,
    productTreatment: hasReference ? template.productTreatmentWithReference : template.productTreatmentNoReference,
    typographyDirection: "Pas de bloc de texte généré par l'image elle-même ; réserve un espace négatif net pour un texte ajouté séparément.",
    callToAction: template.callToAction,
    format,
    constraints,
    userRequest: userPrompt.trim(),
  };
}

type CategoryTemplate = {
  targetAudience: string;
  visualStyle: string;
  mood: string;
  advertisingAngle: string;
  composition: string;
  environment: string;
  lighting: string;
  cameraDirection: string;
  productTreatmentWithReference: string;
  productTreatmentNoReference: string;
  callToAction: string;
};

// Gabarits par catégorie — cf. doc produit §3. Chaque champ reste une
// direction créative courte (pas un roman) pour garder le prompt final
// lisible et éviter de diluer l'intention de l'utilisateur.
const CATEGORY_TEMPLATES: Record<ProductCategory, CategoryTemplate> = {
  ebook: {
    targetAudience: "acheteurs en ligne intéressés par ce contenu numérique",
    visualStyle: "éditorial premium",
    mood: "élégant et inspirant",
    advertisingAngle: "crédibilité du contenu et transformation promise au lecteur",
    composition: "couverture du livre au centre ou légèrement décentrée, hiérarchie publicitaire forte, espace négatif réservé au message",
    environment: "environnement cohérent avec le thème du livre (bureau soigné, support de lecture réel, ambiance calme)",
    lighting: "lumière douce et maîtrisée, contraste modéré",
    cameraDirection: "cadrage produit centré, angle légèrement plongeant ou frontal, profondeur de champ modérée",
    productTreatmentWithReference: "utilise la couverture réelle telle quelle, éventuellement posée sur un support (liseuse, tablette, livre imprimé) dans la scène",
    productTreatmentNoReference: "représente un ouvrage numérique crédible et sobre, sans détail typographique inventé et sans faux titre lisible",
    callToAction: "espace réservé pour un futur appel à l'action (« Télécharger », « Découvrir »)",
  },
  formation: {
    targetAudience: "personnes cherchant à monter en compétence ou à se reconvertir",
    visualStyle: "professionnel et inspirant",
    mood: "motivant et crédible",
    advertisingAngle: "crédibilité professionnelle et bénéfice concret de la formation",
    composition: "support d'apprentissage (écran, carnet, tablette) mis en valeur avec un espace clair pour le message",
    environment: "contexte d'apprentissage réaliste (espace de travail, environnement studieux ou professionnel)",
    lighting: "lumière naturelle et nette, ambiance rassurante",
    cameraDirection: "cadrage mi-large incluant le contexte d'usage, perspective naturelle",
    productTreatmentWithReference: "intègre le support réel fourni (couverture, logo de formation) sans le modifier",
    productTreatmentNoReference: "suggère un contexte d'apprentissage crédible sans texte inventé à l'écran",
    callToAction: "espace réservé pour un futur appel à l'action (« S'inscrire », « Commencer »)",
  },
  mode: {
    targetAudience: "clients sensibles au style et à la qualité perçue",
    visualStyle: "fashion / lifestyle éditorial",
    mood: "élégant et désirable",
    advertisingAngle: "mise en valeur du vêtement ou de l'accessoire et de sa qualité perçue",
    composition: "produit au premier plan, silhouette ou détail texture mis en valeur, espace négatif pour le message",
    environment: "décor lifestyle cohérent avec l'univers de la marque (studio épuré ou extérieur soigné)",
    lighting: "lumière flatteuse type photographie de mode, contraste maîtrisé",
    cameraDirection: "cadrage éditorial, angle mettant en valeur la coupe ou la texture du produit",
    productTreatmentWithReference: "conserve fidèlement la couleur, la coupe et les détails réels du produit fourni",
    productTreatmentNoReference: "représente un produit de mode crédible et cohérent avec la description, sans logo inventé",
    callToAction: "espace réservé pour un futur appel à l'action (« Commander », « Voir la collection »)",
  },
  food: {
    targetAudience: "clients gourmands cherchant une expérience culinaire",
    visualStyle: "photographie culinaire premium",
    mood: "appétissant et chaleureux",
    advertisingAngle: "désirabilité immédiate du produit alimentaire",
    composition: "produit alimentaire au centre, textures et détails visibles, espace négatif pour le message",
    environment: "mise en scène culinaire cohérente (table dressée, planche, emballage réel si fourni)",
    lighting: "lumière chaude et appétissante, légers reflets sur les textures",
    cameraDirection: "cadrage rapproché mettant en valeur la texture et les détails du plat ou produit",
    productTreatmentWithReference: "conserve fidèlement la présentation réelle du produit fourni (couleurs, texture, packaging)",
    productTreatmentNoReference: "représente un produit alimentaire crédible et appétissant cohérent avec la description",
    callToAction: "espace réservé pour un futur appel à l'action (« Commander », « Découvrir la carte »)",
  },
  beaute: {
    targetAudience: "clients attentifs à la qualité et au rituel beauté",
    visualStyle: "éditorial cosmétique premium",
    mood: "raffiné et apaisant",
    advertisingAngle: "qualité perçue du produit et promesse sensorielle",
    composition: "packaging du produit mis en valeur avec un jeu de matières et de reflets, espace négatif pour le message",
    environment: "décor épuré cohérent avec un univers beauté (surface minérale, textiles doux, éléments naturels discrets)",
    lighting: "lumière douce et diffuse, reflets soignés sur le packaging",
    cameraDirection: "cadrage produit rapproché, légère plongée, mise au point nette sur le packaging",
    productTreatmentWithReference: "conserve fidèlement le packaging réel fourni (forme, couleurs, étiquette) sans le redessiner",
    productTreatmentNoReference: "représente un packaging cosmétique crédible et sobre, sans texte d'étiquette inventé et lisible",
    callToAction: "espace réservé pour un futur appel à l'action (« Découvrir », « Commander »)",
  },
  service: {
    targetAudience: "clients cherchant une solution concrète à un besoin précis",
    visualStyle: "photographie de situation réaliste",
    mood: "rassurant et professionnel",
    advertisingAngle: "bénéfice concret du service pour le client",
    composition: "mise en situation claire du service rendu, espace négatif pour le message",
    environment: "contexte réaliste cohérent avec le service décrit",
    lighting: "lumière naturelle et nette",
    cameraDirection: "cadrage mi-large incluant le contexte d'usage du service",
    productTreatmentWithReference: "intègre les éléments visuels réels fournis (logo, support) sans les modifier",
    productTreatmentNoReference: "illustre une situation crédible en lien avec le service décrit, sans texte inventé",
    callToAction: "espace réservé pour un futur appel à l'action (« Réserver », « En savoir plus »)",
  },
  produit_physique: {
    targetAudience: "acheteurs en ligne comparant des produits similaires",
    visualStyle: "photographie produit commerciale",
    mood: "net et désirable",
    advertisingAngle: "qualité perçue et bénéfice principal du produit",
    composition: "produit au centre, mise en valeur des détails clés, espace négatif pour le message",
    environment: "fond ou décor sobre qui ne détourne pas l'attention du produit",
    lighting: "lumière nette et homogène, reflets maîtrisés",
    cameraDirection: "cadrage produit classique, angle valorisant la forme du produit",
    productTreatmentWithReference: "conserve fidèlement la forme, les couleurs et les proportions réelles du produit fourni",
    productTreatmentNoReference: "représente un produit crédible et cohérent avec la description, sans détail inventé trompeur",
    callToAction: "espace réservé pour un futur appel à l'action (« Acheter », « Découvrir »)",
  },
  autre: {
    targetAudience: "clients de la boutique en ligne",
    visualStyle: "publicitaire premium neutre",
    mood: "soigné et professionnel",
    advertisingAngle: "mise en valeur claire du produit ou service proposé",
    composition: "sujet principal centré, hiérarchie visuelle claire, espace négatif pour le message",
    environment: "décor sobre et cohérent avec l'univers de la boutique",
    lighting: "lumière nette et flatteuse",
    cameraDirection: "cadrage équilibré, angle neutre",
    productTreatmentWithReference: "conserve fidèlement l'apparence réelle de l'élément fourni",
    productTreatmentNoReference: "reste cohérent avec la description fournie, sans détail inventé trompeur",
    callToAction: "espace réservé pour un futur appel à l'action",
  },
};
