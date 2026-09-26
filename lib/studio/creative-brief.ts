import { inferProductType, type ProductType } from "./creative-workflows";

export type StudioCreativeInput = {
  name: string;
  description?: string;
  price?: string;
  currency?: string;
};

export type CreativeBrief = {
  objective: string;
  productType: ProductType;
  productName: string;
  productDescription?: string;
  price?: string;
  targetAudience: string;
  style: string;
  tone: string;
  visualDirection: string;
  hook: string;
  headline: string;
  benefits: string[];
  cta: string;
  scene: string;
  environment: string;
  lighting: string;
  camera: string;
  composition: string;
  productPlacement: string;
  format: string;
  platform: string;
  animationDirection?: string;
};

// Direction artistique par type de produit. Elle ne fait que guider le modèle
// (style, scène, lumière, placement du produit) : elle n'invente jamais une
// caractéristique commerciale (nom, prix, description) — ces champs viennent
// uniquement du produit Chariow.
const PRODUCT_DIRECTIONS: Record<ProductType, Pick<CreativeBrief, "style" | "tone" | "scene" | "environment" | "lighting" | "camera" | "composition" | "productPlacement">> = {
  ebook: {
    style: "éditorial premium",
    tone: "élégant, intime et crédible",
    scene: "la couverture réelle du livre mise en scène comme un objet de désir",
    environment: "bureau chaleureux, table en bois, lumière naturelle, texture papier",
    lighting: "lumière douce et feutrée, ambiance intimiste",
    camera: "angle légèrement incliné, profondeur de champ, netteté sur la couverture",
    composition: "hiérarchie publicitaire : titre accrocheur, visuel produit, 2-3 bénéfices, prix, appel à l'action",
    productPlacement: "la couverture réelle est conservée à l'identique, lisible, jamais déformée",
  },
  formation: {
    style: "résultat et transformation",
    tone: "motivant et concret",
    scene: "une personne en train d'apprendre devant un écran, résultat tangible visible",
    environment: "espace de travail moderne, écran d'ordinateur ou téléphone",
    lighting: "lumière claire et énergique",
    camera: "plan rapproché sur la personne et l'écran",
    composition: "promesse forte, preuve de transformation, bénéfices, appel à l'action",
    productPlacement: "le visuel du programme reste identifiable sans être reconstruit",
  },
  saas: {
    style: "produit tech premium",
    tone: "clair, moderne et direct",
    scene: "interface du produit affichée sur un écran, environnement épuré",
    environment: "bureau minimaliste, écran net, ambiance high-tech",
    lighting: "lumière froide et précise, reflets subtils",
    camera: "plan frontal sur l'interface, composition géométrique",
    composition: "capture du problème résolu, bénéfices clés, appel à l'action",
    productPlacement: "l'interface réelle est conservée, nette et lisible",
  },
  mode: {
    style: "photo de mode professionnelle",
    tone: "désirable et lifestyle",
    scene: "le vêtement porté ou mis en scène dans un contexte lifestyle",
    environment: "rue, studio ou décor tendance cohérent avec la marque",
    lighting: "lumière de studio douce, modelé flatteur sur le produit",
    camera: "cadrage mode, mise au point sur le vêtement",
    composition: "produit réel en vedette, ambiance, bénéfice style, appel à l'action",
    productPlacement: "le produit réel reste identifiable (forme, couleurs, logo)",
  },
  food: {
    style: "food photography appétissante",
    tone: "gourmand et sensoriel",
    scene: "gros plan appétissant du plat, textures et vapeur visibles",
    environment: "table soignée, accessoires de cuisine, arrière-plan flou",
    lighting: "lumière chaude latérale, reflets appétissants",
    camera: "macro/gros plan incliné, netteté sur la texture",
    composition: "produit réel en héros, textures, appel à l'action",
    productPlacement: "le plat réel reste identifiable et appétissant",
  },
  physique: {
    style: "product-shot commercial",
    tone: "précis et rassurant",
    scene: "le produit physique sur un fond épuré ou dans son usage réel",
    environment: "fond studio ou mise en situation d'usage",
    lighting: "éclairage studio contrôlé, ombres douces",
    camera: "angle produit, mise au point sur les détails",
    composition: "produit réel, bénéfices, appel à l'action",
    productPlacement: "le produit réel (forme, couleurs, logo) est conservé",
  },
  service: {
    style: "scène de service humain",
    tone: "confiant et accessible",
    scene: "une personne rendant le service, résultat visible",
    environment: "lieu de travail ou de vie en lien avec le service",
    lighting: "lumière naturelle accueillante",
    camera: "plan rapproché sur la personne et le geste",
    composition: "humain + bénéfice clair + appel à l'action",
    productPlacement: "l'identité du service est représentée sans fausse promesse",
  },
  evenement: {
    style: "affiche événementielle dynamique",
    tone: "enthousiaste et exclusif",
    scene: "l'ambiance de l'événement, foule, lumière, énergie",
    environment: "scène, salle, décor de l'événement",
    lighting: "éclairage scénique, contrastes forts",
    camera: "plan large dynamique, mouvement",
    composition: "date/lieu suggérés sans invention, ambiance, appel à l'action",
    productPlacement: "l'identité visuelle de l'événement est conservée",
  },
  autre: {
    style: "visuel promotionnel soigné",
    tone: "professionnel",
    scene: "le produit mis en valeur dans un contexte adapté",
    environment: "contexte neutre et valorisant",
    lighting: "éclairage flatteur",
    camera: "cadrage produit classique",
    composition: "produit, bénéfice, appel à l'action",
    productPlacement: "le produit réel est conservé et mis en valeur",
  },
};

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

function deriveObjective(userPrompt: string): string {
  return userPrompt || "mettre en valeur le produit et inciter à l'achat";
}

function deriveTargetAudience(userPrompt: string): string {
  // Pas d'invention : on ne cible que ce que la demande exprime, sinon on reste générique.
  const brief = userPrompt.toLowerCase();
  if (/(femme|homme|étudiant|entrepreneur|parent|jeune|professionnel|mère|père)/.test(brief)) return "l'audience mentionnée dans la demande";
  return "la clientèle cible du produit";
}

export function buildCreativeBrief(
  product: StudioCreativeInput,
  userPrompt: string,
  mediaType: "image" | "video",
  format = "1:1",
  platform = "Facebook / Instagram",
): CreativeBrief {
  const productType = inferProductType(product.name, product.description);
  const direction = PRODUCT_DIRECTIONS[productType];
  const price = product.price ? `${product.price}${product.currency ? ` ${product.currency}` : ""}` : undefined;

  return {
    objective: deriveObjective(userPrompt),
    productType,
    productName: product.name,
    productDescription: product.description,
    price,
    targetAudience: deriveTargetAudience(userPrompt),
    style: direction.style,
    tone: direction.tone,
    visualDirection: userPrompt || `visuel ${direction.style} pour un ${productType}`,
    hook: userPrompt.split(/[.!?]/)[0]?.trim().slice(0, 80) || `Découvre ${product.name}`,
    headline: userPrompt || product.name,
    benefits: [],
    cta: "En savoir plus / Commander",
    scene: direction.scene,
    environment: direction.environment,
    lighting: direction.lighting,
    camera: direction.camera,
    composition: direction.composition,
    productPlacement: direction.productPlacement,
    format,
    platform,
    animationDirection: mediaType === "video" ? `animation ${direction.style}, mouvements de caméra subtils, produit conservé` : undefined,
  };
}

// Transforme le brief structuré en prompt final pour le modèle. Le modèle reçoit
// la direction artistique et la consigne stricte de conservation du produit ;
// le texte exact (prix, CTA, bénéfices) reste destiné à la couche de composition
// Vendeo, pas à être recréé de façon approximative par le modèle.
export function briefToPrompt(brief: CreativeBrief, mediaType: "image" | "video", hasReference: boolean): string {
  const parts: string[] = [];

  if (mediaType === "image") {
    parts.push(`Visuel publicitaire professionnel pour ${brief.productName}, sans aucun texte.`);
    parts.push(`Objectif : ${brief.objective}.`);
    parts.push(`Style : ${brief.style}, ton ${brief.tone}.`);
    parts.push(`Scène : ${brief.scene}.`);
    parts.push(`Environnement : ${brief.environment}. Éclairage : ${brief.lighting}.`);
    parts.push(`Cadrage : ${brief.camera}.`);
    parts.push(`Composition : produit bien mis en valeur, espace négatif réservé pour du texte ajouté ensuite.`);
    parts.push("N'écris AUCUN texte, aucun mot, aucune lettre, aucun chiffre, aucun logo, aucun slogan dans l'image.");
  } else {
    parts.push(`Vidéo publicitaire pour ${brief.productName}.`);
    parts.push(`Objectif : ${brief.objective}.`);
    parts.push(`Scène : ${brief.scene}. ${brief.animationDirection ?? ""}.`);
    parts.push(`Lumière : ${brief.lighting}.`);
    parts.push("Pas de texte à l'écran, pas de logo inventé.");
  }

  if (hasReference) {
    parts.push(mediaType === "image"
      ? "Image de référence = visuel réel du produit. Conserve fidèlement son apparence (forme, couleurs, titre, logo) sans la déformer ni la recréer."
      : "Le produit de [Image1] : conserve son apparence exacte (forme, couleurs, titre) pendant toute la vidéo. Anime uniquement la caméra, la lumière et l'environnement autour de lui, sans le déformer.");
  }

  return parts.join(" ").slice(0, 6000);
}
