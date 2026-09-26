import type { CreativeBrief } from "./creative-brief";

// Couche de composition publicitaire (préparée pour la v2).
//
// Objectif : séparer la génération VISUELLE (faite par le modèle) de la
// COMPOSITION publicitaire (faite par Vendeo). Le modèle génère la scène et les
// éléments visuels ; Vendeo superpose ensuite les textes EXACTS (headline, prix,
// bénéfices, CTA) avec son propre système, pour éviter fautes, prix incorrects
// ou texte illisible produits par un modèle d'image.
//
// Cette couche est pour l'instant DÉCLARATIVE : elle décrit la hiérarchie d'une
// affiche publicitaire. Le rendu effectif (superposition SVG/Canvas/Sharp) sera
// branché ici dans une prochaine itération, sans toucher au pipeline créatif.

export type AdPosterBlockType = "headline" | "visual" | "benefits" | "price" | "cta";

export type AdPosterBlock = {
  type: AdPosterBlockType;
  text?: string;
  style?: "hero" | "body" | "accent";
};

// Hiérarchie standard d'une affiche publicitaire professionnelle.
export function buildAdPosterStructure(brief: CreativeBrief): AdPosterBlock[] {
  const blocks: AdPosterBlock[] = [
    { type: "headline", text: brief.headline, style: "hero" },
    { type: "visual" },
  ];
  if (brief.benefits.length) blocks.push({ type: "benefits", text: brief.benefits.join(" · ") });
  if (brief.price) blocks.push({ type: "price", text: brief.price });
  blocks.push({ type: "cta", text: brief.cta, style: "accent" });
  return blocks;
}