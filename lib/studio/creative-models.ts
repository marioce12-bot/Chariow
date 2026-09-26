import { getAiImageModel, getAiImageEditModel, getAiVideoTextModel, getAiVideoImageModel } from "@/lib/ai/fal";
import type { ProductType } from "./creative-workflows";

// Abstraction de sélection des modèles. Le choix dépend de la TÂCHE, pas d'un
// chemin générique unique : conservation stricte du produit → modèle d'édition,
// création libre → modèle de génération, vidéo avec image → image-to-video.
export type StudioImageTask = "image_generate" | "image_product";
export type StudioVideoTask = "video_text" | "video_image";

export function selectImageModel(task: StudioImageTask): string {
  return task === "image_product" ? getAiImageEditModel() : getAiImageModel();
}

export function selectVideoModel(hasReference: boolean): string {
  return hasReference ? getAiVideoImageModel() : getAiVideoTextModel();
}

// Type de tâche image recommandé selon le type de produit : les produits avec un
// visuel à conserver strictement (ebook, mode, physique, food, événement) passent
// par un workflow orienté conservation, les autres par une génération libre.
export function imageTaskForProductType(productType: ProductType, hasReference: boolean): StudioImageTask {
  if (!hasReference) return "image_generate";
  return productType === "ebook" || productType === "mode" || productType === "physique" || productType === "food" || productType === "evenement"
    ? "image_product"
    : "image_generate";
}