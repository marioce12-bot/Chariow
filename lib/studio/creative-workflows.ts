import type { CreativeBrief, ProductCategory } from "./creative-brief";
import { getAiImageEditModel, getAiImageModel } from "@/lib/ai/fal";

// Choix centralisé du modèle fal.ai à utiliser pour une génération d'image,
// en fonction du brief créatif (aujourd'hui : uniquement la catégorie de
// produit). Le comportement par défaut est strictement identique à avant
// (un seul modèle, piloté par FAL_IMAGE_MODEL / FAL_IMAGE_EDIT_MODEL) : ceci
// ne fait qu'ouvrir la porte à un modèle différent par catégorie via une
// variable d'environnement dédiée (FAL_IMAGE_EDIT_MODEL_<CATEGORIE>), sans
// jamais forcer un changement de modèle si elle n'est pas définie.
export function selectImageWorkflow(brief: CreativeBrief, hasReference: boolean) {
  const model = hasReference ? getAiImageEditModel(brief.productType) : getAiImageModel(brief.productType);
  return { model, workflowId: `${brief.productType}${hasReference ? "-reference" : "-generation"}` };
}

// Stub volontairement minimal (cf. doc produit §11) : prépare la place pour
// une évaluation automatique post-génération (produit visible, non déformé,
// composition publicitaire...) sans construire tout de suite le pipeline
// generate → evaluate → regenerate. Retourne toujours "ok" pour l'instant :
// rien n'est bloqué ni changé dans le comportement actuel.
export type CreativeEvaluation = { ok: boolean; issues: string[] };
export function evaluateCreative(_imageUrl: string, _brief: CreativeBrief): CreativeEvaluation {
  return { ok: true, issues: [] };
}

export type { ProductCategory };
