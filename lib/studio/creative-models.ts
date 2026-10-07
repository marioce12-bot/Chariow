import { getAiVideoTextModel, getAiVideoImageModel } from "@/lib/ai/fal";

export type StudioVideoTask = "video_text" | "video_image";

export function selectVideoModel(hasReference: boolean): string {
  return hasReference ? getAiVideoImageModel() : getAiVideoTextModel();
}
