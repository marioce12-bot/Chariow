import type { CreativeBrief } from "./creative-brief";

export type StudioProductInput = {
  id?: string;
  name: string;
  description?: string;
  price?: string;
  currency?: string;
  imageUrl?: string | null;
};

export type StudioVideoOptions = {
  theme?: string;
  ambiance?: string;
  characterType?: string;
  videoType?: string;
};

const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function parseStudioProduct(raw: unknown): StudioProductInput | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const name = clean(source.name, 200);
  if (!name) return null;
  const price = typeof source.price === "number" || typeof source.price === "string" ? String(source.price).slice(0, 40) : "";
  let imageUrl: string | null = null;
  if (typeof source.imageUrl === "string") {
    try {
      const url = new URL(source.imageUrl);
      if (url.protocol === "https:" && /(^|\.)chariow\.com$/i.test(url.hostname)) imageUrl = url.toString();
    } catch {}
  }
  // La description Chariow d'une fiche produit détaillée peut largement dépasser
  // quelques centaines de caractères. Un plafond trop bas la coupait en plein
  // milieu et donnait un prompt incomplet côté génération d'image/vidéo — on
  // garde une limite large plutôt que de la retirer complètement, pour éviter
  // un prompt démesuré si une description est anormalement longue.
  return { id: clean(source.id, 80) || undefined, name, description: clean(source.description, 4000) || undefined, price: price || undefined, currency: clean(source.currency, 8) || undefined, imageUrl };
}

// Quatre tentatives successives ont ajouté des consignes de plus en plus
// précises au prompt vidéo (structure en plans, interdiction de parole, de
// texte à l'écran, règles de fin de plan, options théme/ambiance/personnage
// glissées en phrases imposées...). Constat après plusieurs mises en
// production avec l'ancien fournisseur (Imole) : le modèle vidéo ne suivait
// fiablement aucune de ces consignes, quel que soit leur degré de détail — la
// qualité perçue ne s'est jamais améliorée, seul le prompt est devenu plus
// long et plus rigide. À la demande explicite de l'équipe produit, on reste
// au plus simple avec le fournisseur actuel (fal.ai) : pour la vidéo, on
// transmet uniquement le sujet (le brief de l'utilisateur, et le strict
// nécessaire pour savoir de quel produit il s'agit s'il y en a un), sans
// aucune instruction de réalisation, de voix, de texte ou de mise en scène.
//
// Ceci reste inchangé : buildStudioPrompt(kind="video", ...) garde exactement
// son comportement d'origine. Pour l'image, la branche historique (prompt
// plat) est conservée telle quelle pour compatibilité, mais la route
// /api/studio/image utilise désormais buildAdvertisingImagePrompt ci-dessous,
// construit à partir d'un CreativeBrief structuré plutôt que d'une simple
// concaténation.
export function buildStudioPrompt(kind: "image" | "video", userPrompt: string, product: StudioProductInput | null, hasReference = false, videoOptions: StudioVideoOptions = {}) {
  const brief = userPrompt.trim();
  if (kind === "video") {
    if (!product) return brief;
    const priceLine = product.price ? ` Prix : ${product.price}${product.currency ? ` ${product.currency}` : ""}.` : "";
    return [`Produit : « ${product.name} ».${product.description ? ` ${product.description}` : ""}${priceLine}`, brief].filter(Boolean).join(" ").slice(0, 6000);
  }
  if (!product) return brief;
  const priceLine = product.price ? `Prix : ${product.price}${product.currency ? ` ${product.currency}` : ""}.` : "";
  const defaultBrief = "visuel promotionnel soigné mettant le produit en valeur";
  return [
    "Crée un visuel professionnel pour ce produit numérique de la boutique.",
    `Produit : « ${product.name} ».`, product.description ? `Description : ${product.description}` : "", priceLine,
    `Demande de l'utilisateur : ${brief || defaultBrief}.`,
    hasReference ? "Image de référence : c'est la couverture du produit ; conserve fidèlement son apparence (forme, couleurs, titre) et ne la déforme pas." : "",
    "Consignes : composition professionnelle, produit bien mis en valeur, aucun texte flou ni faute d'orthographe, n'invente ni prix, ni logo, ni promesse absents des informations ci-dessus.",
  ].filter(Boolean).join(" ").slice(0, 6000);
}

// Traduit un fond demandé par l'utilisateur (option "background" du Studio)
// en instruction explicite : nano-banana n'a pas de paramètre API dédié pour
// ça, donc la seule façon de le "réellement exploiter" (plutôt que de faire
// semblant de le supporter) est de le formuler dans le prompt lui-même.
function backgroundInstruction(background: "auto" | "opaque" | "transparent" | undefined) {
  if (background === "transparent") return "Fond totalement transparent, produit proprement détouré, sans arrière-plan ni décor visible.";
  if (background === "opaque") return "Fond opaque et uni, aucune zone transparente.";
  return "";
}

// Construit le prompt publicitaire final à partir d'un CreativeBrief
// structuré (cf. lib/studio/creative-brief.ts) plutôt que d'une simple
// concaténation générique. La demande de l'utilisateur (brief.userRequest)
// reste le point de départ explicite du prompt — elle est enrichie par la
// direction artistique déduite, pas remplacée.
export function buildAdvertisingImagePrompt(
  brief: CreativeBrief,
  product: StudioProductInput | null,
  background?: "auto" | "opaque" | "transparent",
): string {
  const priceLine = product?.price ? `Prix : ${product.price}${product.currency ? ` ${product.currency}` : ""}.` : "";
  const parts = [
    "Crée une publicité professionnelle pour ce produit, digne d'un directeur artistique — pas une simple image générée par IA.",
    product ? `Produit : « ${product.name} ».` : "",
    product?.description ? `Description du produit : ${product.description}` : "",
    priceLine,
    `Demande de l'utilisateur : ${brief.userRequest || "visuel promotionnel soigné mettant le produit en valeur"}.`,
    `Style visuel : ${brief.visualStyle}, ambiance ${brief.mood}.`,
    `Angle publicitaire : ${brief.advertisingAngle}.`,
    `Composition : ${brief.composition}.`,
    `Environnement : ${brief.environment}.`,
    `Lumière : ${brief.lighting}.`,
    `Cadrage : ${brief.cameraDirection}.`,
    `Traitement du produit : ${brief.productTreatment}.`,
    brief.headlineDirection,
    brief.typographyDirection,
    backgroundInstruction(background),
    `Contraintes : ${brief.constraints.join(" ")}`,
  ];
  return parts.filter(Boolean).join(" ").slice(0, 6000);
}
