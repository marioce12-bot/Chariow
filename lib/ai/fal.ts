import { fal } from "@fal-ai/client";

const DEFAULT_IMAGE_MODEL = "fal-ai/nano-banana";
const DEFAULT_IMAGE_EDIT_MODEL = "fal-ai/nano-banana/edit";
const DEFAULT_VIDEO_TEXT_MODEL = "fal-ai/ltx-2.3/text-to-video";
const DEFAULT_VIDEO_IMAGE_MODEL = "fal-ai/ltx-2.3/image-to-video";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const apiKey = process.env.FAL_API_KEY;
  if (!apiKey) throw new Error("FAL_API_KEY is not configured");
  fal.config({ credentials: apiKey });
  configured = true;
}

export function getAiImageModel() {
  return process.env.FAL_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
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

// fal ne propose pas de réglage "quality"/"resolution"/"background" identique à
// Imole sur ses modèles d'image grand public : on ne mappe que ce qui a un
// équivalent direct (l'orientation, via image_size) et on ignore le reste sans
// faire échouer la génération.
const ORIENTATION_TO_IMAGE_SIZE: Record<string, string> = {
  square: "square_hd",
  landscape: "landscape_16_9",
  portrait: "portrait_16_9",
};

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
) {
  const orientation = options.orientation ?? (format === "story" ? "portrait" : format === "banner" ? "landscape" : "square");
  const model = getAiImageModel();
  return runImageModel(
    model,
    { prompt, image_size: ORIENTATION_TO_IMAGE_SIZE[orientation] ?? "square_hd", num_images: 1 },
    "fal.ai image API error",
  );
}

export async function generateFalImageWithReferences(
  prompt: string,
  references: StudioReferenceImage[],
  _options: StudioImageOptions = {},
) {
  const model = getAiImageEditModel();
  return runImageModel(
    model,
    { prompt, image_urls: references.slice(0, 3).map(referenceDataUrl), num_images: 1 },
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

// Les modèles vidéo fal utilisés ici n'acceptent pas les mêmes valeurs que
// l'ancienne API Imole (480p/768p, ratios larges type 21:9, durée libre en
// secondes) : on rapproche chaque valeur reçue du Studio de l'option fal la
// plus proche plutôt que de casser la génération sur une valeur refusée.
const VIDEO_RESOLUTION_MAP: Record<string, string> = { "480p": "1080p", "768p": "1080p" };
const VIDEO_ASPECT_RATIO_MAP: Record<string, string> = {
  "21:9": "16:9",
  "16:9": "16:9",
  "4:3": "16:9",
  "1:1": "auto",
  "3:4": "9:16",
  "9:16": "9:16",
};
const ALLOWED_VIDEO_DURATIONS = [6, 8, 10];
function closestAllowedDuration(duration: number) {
  return ALLOWED_VIDEO_DURATIONS.reduce((closest, value) =>
    Math.abs(value - duration) < Math.abs(closest - duration) ? value : closest,
  ALLOWED_VIDEO_DURATIONS[0]);
}

export type StudioVideoGenerationOptions = {
  duration: number;
  resolution: "480p" | "768p";
  aspectRatio: string;
  referenceUrl?: string | null;
  referenceMode?: "image" | "reference";
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
  const duration = closestAllowedDuration(options.duration);
  const resolution = VIDEO_RESOLUTION_MAP[options.resolution] ?? "1080p";
  const aspectRatio = VIDEO_ASPECT_RATIO_MAP[options.aspectRatio] ?? "auto";
  const useImage = Boolean(options.referenceUrl);
  const model = useImage ? getAiVideoImageModel() : getAiVideoTextModel();

  const input: Record<string, unknown> = { prompt, duration: String(duration), resolution, aspect_ratio: aspectRatio };
  if (useImage) input.image_url = options.referenceUrl;

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
