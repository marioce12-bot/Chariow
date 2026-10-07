import { fal } from "@fal-ai/client";
import { isSupportedVideoDuration, isSupportedVideoResolution, isSupportedVideoAspectRatio, type VideoDuration, type VideoResolution, type VideoAspectRatio } from "@/lib/studio/creative-workflows";

// Modèles choisis :
// - Mode rapide texte→image : FLUX.1 [schnell].
// - Mode avancé affiche : GPT Image 2.5 Flare, conçu pour les compositions et le texte lisible.
// - Édition image (conservation du produit) : GPT Image 2.5 Flare edit.
// - Vidéo texte→vidéo et image→vidéo : Seedance 2.5 (jusqu'à 30 s, 480p/720p/1080p).
const DEFAULT_IMAGE_MODEL = "fal-ai/flux/schnell";
const DEFAULT_ADVANCED_IMAGE_MODEL = "openai/gpt-image-2.5/flare/text-to-image";
const DEFAULT_IMAGE_EDIT_MODEL = "openai/gpt-image-2.5/flare/edit";
const DEFAULT_VIDEO_TEXT_MODEL = "xai/grok-imagine-video/v1.5/text-to-video";
const DEFAULT_VIDEO_IMAGE_MODEL = "xai/grok-imagine-video/v1.5/image-to-video";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY is not configured");
  fal.config({ credentials: apiKey });
  configured = true;
}

export function getAiImageModel(mode: "fast" | "advanced" = "fast") {
  return process.env.FAL_IMAGE_MODEL?.trim() || (mode === "advanced" ? DEFAULT_ADVANCED_IMAGE_MODEL : DEFAULT_IMAGE_MODEL);
}

export function getAiImageEditModel() {
  return process.env.FAL_IMAGE_EDIT_MODEL?.trim() || DEFAULT_IMAGE_EDIT_MODEL;
}

export function getAiVideoTextModel() {
  return process.env.FAL_VIDEO_TEXT_MODEL?.trim() || DEFAULT_VIDEO_TEXT_MODEL;
}

export function getAiVideoImageModel() {
  return process.env.FAL_VIDEO_IMAGE_MODEL?.trim() || DEFAULT_VIDEO_IMAGE_MODEL;
}

export type StudioImageOptions = {
  orientation?: "square" | "landscape" | "portrait";
  quality?: "medium" | "high" | "xhigh" | "max";
  resolution?: "hd" | "full_hd" | "2k" | "4k";
  imageMode?: "fast" | "advanced";
  background?: "auto" | "opaque" | "transparent";
  outputFormat?: "png" | "jpeg";
};
export type StudioReferenceImage = { buffer: Buffer; type: string };

function referenceDataUrl(image: StudioReferenceImage) {
  return `data:${image.type};base64,${image.buffer.toString("base64")}`;
}

// Les modèles avancés acceptent la qualité, le fond, le format de sortie et des
// dimensions personnalisées. Schnell conserve ses presets d'image compatibles.
const ORIENTATION_TO_IMAGE_SIZE: Record<string, string> = {
  square: "square_hd",
  landscape: "landscape_16_9",
  portrait: "portrait_16_9",
};
const ADVANCED_IMAGE_SIZES: Record<string, Record<string, { width: number; height: number }>> = {
  square: { hd: { width: 1024, height: 1024 }, full_hd: { width: 1536, height: 1536 }, "2k": { width: 2048, height: 2048 }, "4k": { width: 2880, height: 2880 } },
  landscape: { hd: { width: 1024, height: 576 }, full_hd: { width: 1920, height: 1080 }, "2k": { width: 2560, height: 1440 }, "4k": { width: 3840, height: 2160 } },
  portrait: { hd: { width: 576, height: 1024 }, full_hd: { width: 1080, height: 1920 }, "2k": { width: 1440, height: 2560 }, "4k": { width: 2160, height: 3840 } },
};
function isAdvancedImageModel(model: string) {
  return /gpt-image|nano-banana/i.test(model);
}
function imageInput(model: string, options: StudioImageOptions, orientation: string) {
  const input: Record<string, unknown> = {
    image_size: isAdvancedImageModel(model) ? ADVANCED_IMAGE_SIZES[orientation]?.[options.resolution ?? "hd"] ?? ORIENTATION_TO_IMAGE_SIZE[orientation] : ORIENTATION_TO_IMAGE_SIZE[orientation],
    num_images: 1,
  };
  if (isAdvancedImageModel(model)) {
    input.quality = options.quality ?? "medium";
    input.output_format = options.outputFormat === "jpeg" ? "jpeg" : "png";
    if (options.background !== "auto") input.background = options.background;
  }
  return input;
}

type FalImageResult = { data?: { images?: Array<{ url?: string }> } };

async function runImageModel(model: string, input: Record<string, unknown>, errorLabel: string) {
  ensureConfigured();
  try {
    const result = (await fal.subscribe(model, { input, logs: false })) as FalImageResult;
    const url = result?.data?.images?.[0]?.url;
    if (!url) throw new Error("fal.ai n'a renvoyé aucune image");
    return url;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${errorLabel}: ${message} (modèle ${model})`);
  }
}

export async function generateFalImage(
  prompt: string,
  format: "square" | "story" | "banner" = "square",
  options: StudioImageOptions = {},
  selectedModel?: string,
) {
  const orientation = options.orientation ?? (format === "story" ? "portrait" : format === "banner" ? "landscape" : "square");
  const model = selectedModel ?? getAiImageModel(options.imageMode);
  return runImageModel(
    model,
    { prompt, ...imageInput(model, options, orientation) },
    "fal.ai image API error",
  );
}

export async function generateFalImageWithReferences(
  prompt: string,
  references: StudioReferenceImage[],
  options: StudioImageOptions = {},
  selectedModel?: string,
) {
  const model = selectedModel ?? getAiImageEditModel();
  const orientation = options.orientation ?? "square";
  return runImageModel(
    model,
    { prompt, image_urls: references.slice(0, 3).map(referenceDataUrl), ...imageInput(model, options, orientation) },
    "fal.ai image edit API error",
  );
}

// Variante de l'édition qui part directement d'une URL publique (ex. une image
// déjà stockée dans Supabase Storage) plutôt que de re-télécharger le fichier
// pour le repasser en base64.
export async function generateFalImageFromUrl(prompt: string, imageUrl: string) {
  const model = getAiImageEditModel();
  return runImageModel(model, { prompt, image_urls: [imageUrl], num_images: 1 }, "fal.ai image edit API error");
}

export type StudioVideoGenerationOptions = {
  duration: VideoDuration;
  resolution: VideoResolution;
  aspectRatio: VideoAspectRatio;
  referenceUrl?: string | null;
};

// L'identifiant de job retourné combine le modèle fal utilisé et le request_id
// de la queue fal (`model::request_id`) : contrairement à Imole, la queue fal
// exige de connaître le modèle d'origine pour interroger le statut ou récupérer
// le résultat d'une requête.
function encodeJobId(model: string, requestId: string) {
  return `${model}::${requestId}`;
}
function decodeJobId(jobId: string) {
  const separatorIndex = jobId.lastIndexOf("::");
  if (separatorIndex === -1) throw new Error("Identifiant de génération vidéo invalide");
  return { model: jobId.slice(0, separatorIndex), requestId: jobId.slice(separatorIndex + 2) };
}

export async function createFalVideo(prompt: string, options: StudioVideoGenerationOptions) {
  ensureConfigured();
  // Validation stricte : aucune valeur n'est transformée silencieusement. Si une
  // valeur non supportée arrive jusqu'ici, c'est un bug de l'interface et on
  // refuse plutôt que de générer une vidéo différente de ce que l'utilisateur attend.
  if (!isSupportedVideoDuration(options.duration)) throw new Error(`Durée vidéo non supportée : ${options.duration}s`);
  if (!isSupportedVideoResolution(options.resolution)) throw new Error(`Résolution vidéo non supportée : ${options.resolution}`);
  if (!isSupportedVideoAspectRatio(options.aspectRatio)) throw new Error(`Format vidéo non supporté : ${options.aspectRatio}`);

  const duration = options.duration;
  const resolution = options.resolution;
  const aspectRatio = options.aspectRatio;
  const useImage = Boolean(options.referenceUrl);
  const model = useImage ? getAiVideoImageModel() : getAiVideoTextModel();

  // Grok Imagine 1.5 : `duration` est un nombre (secondes), `image_url` est
  // singulier (image-to-video), et `aspect_ratio` n'est accepté que pour le
  // texte-to-video.
  const input: Record<string, unknown> = { prompt, duration, resolution };
  if (useImage) {
    input.image_url = options.referenceUrl;
  } else {
    input.aspect_ratio = aspectRatio;
  }

  try {
    const { request_id } = await fal.queue.submit(model, { input });
    if (!request_id) throw new Error("fal.ai n'a renvoyé aucun identifiant de génération vidéo");
    return encodeJobId(model, request_id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`fal.ai video API error: ${message} (modèle ${model})`);
  }
}

const COMPLETED_QUEUE_STATUSES = new Set(["COMPLETED"]);
const FAILED_QUEUE_STATUSES = new Set(["ERROR"]);

export async function getFalVideoJob(jobId: string) {
  ensureConfigured();
  const { model, requestId } = decodeJobId(jobId);
  const status = await fal.queue.status(model, { requestId, logs: false });
  const rawStatus = String((status as { status?: string }).status || "");
  const mapped = COMPLETED_QUEUE_STATUSES.has(rawStatus) ? "completed" : FAILED_QUEUE_STATUSES.has(rawStatus) ? "failed" : "processing";
  return { id: jobId, status: mapped };
}

type FalVideoResult = { data?: { video?: { url?: string } } };

export async function getFalVideoUrl(jobId: string) {
  ensureConfigured();
  const { model, requestId } = decodeJobId(jobId);
  const result = (await fal.queue.result(model, { requestId })) as FalVideoResult;
  const videoUrl = result?.data?.video?.url;
  if (!videoUrl) throw new Error("fal.ai n'a renvoyé aucune vidéo");
  return videoUrl;
}

export async function downloadFalVideo(jobId: string) {
  const videoUrl = await getFalVideoUrl(jobId);
  const response = await fetch(videoUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`fal.ai video content download returned ${response.status}`);
  return { body: await response.arrayBuffer(), contentType: response.headers.get("content-type") || "video/mp4" };
}
