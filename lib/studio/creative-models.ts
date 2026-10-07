import { getAiImageModel, getAiImageEditModel, getAiVideoTextModel, getAiVideoImageModel } from "@/lib/ai/fal";
import type { ProductType } from "./creative-workflows";

// Abstraction de sélection des modèles. Le choix dépend de la TÂCHE, pas d'un
// chemin générique unique : conservation stricte du produit → modèle d'édition,
// création libre → modèle de génération, vidéo avec image → image-to-video.
export type StudioImageTask = "image_generate" | "image_product";
export type StudioImageMode = "fast" | "advanced";
export type StudioVideoTask = "video_text" | "video_image";

export function selectImageModel(task: StudioImageTask, mode: StudioImageMode = "fast"): string {
  return task === "image_product" ? getAiImageEditModel() : getAiImageModel(mode);
}

export function selectVideoModel(hasReference: boolean): string {
  return hasReference ? getAiVideoImageModel() : getAiVideoTextModel();
}

// Toute image de référence doit passer par le workflow d'édition afin de
// conserver la couverture ou le produit, quel que soit son type commercial.
export function imageTaskForProductType(_productType: ProductType, hasReference: boolean): StudioImageTask {
  if (!hasReference) return "image_generate";
  return "image_product";
}
