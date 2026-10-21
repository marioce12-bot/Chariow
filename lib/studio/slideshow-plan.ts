import { compileFaithfulPrompt, sourceCopyCandidates, type CreativePlan } from "@/lib/studio/faithful-prompt";
import { splitVideoDuration, type VideoAdInput } from "@/lib/studio/video-plan";

export type SlideshowPlan = {
  duration: number; aspectRatio: string; transitionSeconds: number;
  musicId?: string;
  slides: Array<{ index: number; prompt: string; displaySeconds: number }>;
  prompt: string;
};

/** No image call here. Future workers must pass these prompts and the real product reference to the configured image model. */
export function buildSlideshowPlan(input: VideoAdInput, musicId?: string): SlideshowPlan {
  const parts = splitVideoDuration(input.duration);
  const count = Math.max(2, parts.length);
  const transitionSeconds = 0.5;
  const displaySeconds = (input.duration + (count - 1) * transitionSeconds) / count;
  const candidates = sourceCopyCandidates(input.description);
  const treatments: CreativePlan[] = [
    { style: "cinematic", composition: "focal", copyIndices: [] },
    { style: "editorial", composition: "asymmetric", copyIndices: candidates.length ? [0] : [] },
    { style: "graphic", composition: "spacious", copyIndices: candidates.length > 1 ? [1] : [] },
    { style: "minimal", composition: "typographic", copyIndices: [] },
  ];
  const orientation = input.aspectRatio === "9:16" ? "portrait" : input.aspectRatio === "16:9" ? "landscape" : "square";
  const slides = Array.from({ length: count }, (_, index) => ({
    index, displaySeconds,
    prompt: compileFaithfulPrompt({ evidence: { name: input.name, description: input.description, hasReference: input.hasReference }, candidates, plan: treatments[index % treatments.length], orientation, background: "opaque", character: "without" }) + `\nSLIDESHOW CONTINUITY: Image ${index + 1}/${count}. Keep the same real product cover, identity, type family and reference-derived palette across the sequence. Leave mobile-safe margins. ${index === 0 ? "Strong title/cover reveal." : index === count - 1 ? "Calm closing hero composition." : "Highlight only the exact selected source copy, no invented content."}`,
  }));
  const selectedMusicId = musicId && /^\d+$/.test(musicId) ? musicId : undefined;
  return { duration: input.duration, aspectRatio: input.aspectRatio, transitionSeconds, musicId: selectedMusicId, slides, prompt: `Diaporama animé — ${input.name.slice(0, 200)} — ${input.duration}s, ${input.aspectRatio}.\n${count} images distinctes à générer ultérieurement avec le modèle image configuré et la vraie couverture produit.\n${slides.map((slide, index) => `Image ${index + 1}: ${index === 0 ? "Révélation du titre et de la couverture" : index === count - 1 ? "Conclusion visuelle sur le produit" : "Mise en valeur des informations confirmées"}; affichage ${slide.displaySeconds.toFixed(3)}s.`).join("\n")}\nFondus enchaînés de ${transitionSeconds}s, chevauchements inclus pour une durée finale exacte de ${input.duration}s. ${selectedMusicId ? `Musique Commons n°${selectedMusicId}, à revalider avec sa licence et attribution avant le rendu.` : "Sans musique sélectionnée."} Aucun contenu produit inventé, aucune image ni musique générée lors de cette préparation.` };
}

export async function prepareSlideshowImages(plan: SlideshowPlan, jobId: string, generate: (input: { prompt: string; index: number; idempotencyKey: string }) => Promise<{ path: string }>) {
  if (!jobId.trim()) throw new Error("Identifiant de préparation requis");
  const images: Array<{ path: string; duration: number }> = [];
  for (const slide of plan.slides) {
    const image = await generate({ prompt: slide.prompt, index: slide.index, idempotencyKey: `${jobId}:image:${slide.index}` });
    if (!image.path) throw new Error("Image manquante; montage annulé");
    images.push({ path: image.path, duration: slide.displaySeconds });
  }
  return images;
}

/** Worker seam, intentionally not connected to an HTTP generation route. Music resolution must
 * revalidate the file-specific license and make an authorized local copy before returning its path.
 */
export async function runPreparedSlideshow(plan: SlideshowPlan, jobId: string, dependencies: {
  generateImage: Parameters<typeof prepareSlideshowImages>[2];
  resolveLicensedMusic: (id: string) => Promise<{ path: string; commercialUseAllowed: boolean; attribution: string; sourceUrl: string }>;
  assemble: (input: { imagePaths: string[]; duration: number; transitionDuration: number; musicPath?: string }) => Promise<unknown>;
}) {
  // Resolve rights before any potentially chargeable image generation.
  const music = plan.musicId ? await dependencies.resolveLicensedMusic(plan.musicId) : undefined;
  if (music && (!music.commercialUseAllowed || !music.path || !music.attribution || !music.sourceUrl.startsWith("https://commons.wikimedia.org/"))) throw new Error("Licence musicale non validée; rendu annulé");
  const images = await prepareSlideshowImages(plan, jobId, dependencies.generateImage);
  const result = await dependencies.assemble({ imagePaths: images.map(image => image.path), duration: plan.duration, transitionDuration: plan.transitionSeconds, musicPath: music?.path });
  return { result, attribution: music?.attribution ?? "" };
}
