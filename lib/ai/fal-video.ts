import { fal } from "@fal-ai/client";

const COMPOSE_ENDPOINT = "fal-ai/ffmpeg-api/compose";
const MERGE_ENDPOINT = "fal-ai/ffmpeg-api/merge-videos";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error("FAL_API_KEY is not configured");
  fal.config({ credentials: key });
  configured = true;
}

function encode(endpoint: string, requestId: string) {
  return `${endpoint}::${requestId}`;
}
function decode(jobId: string) {
  const separator = jobId.lastIndexOf("::");
  if (separator < 1) throw new Error("Identifiant fal invalide");
  return { endpoint: jobId.slice(0, separator), requestId: jobId.slice(separator + 2) };
}

export type FalAssemblyTrack = {
  id: string;
  type: "video" | "image" | "audio";
  keyframes: Array<{ timestamp: number; duration: number; url: string }>;
};

export async function submitFalQueue(endpoint: string, input: Record<string, unknown>) {
  ensureConfigured();
  const result = await fal.queue.submit(endpoint, { input });
  if (!result.request_id) throw new Error(`fal n’a pas renvoyé de request_id pour ${endpoint}`);
  return encode(endpoint, result.request_id);
}

export async function getFalQueueStatus(jobId: string) {
  ensureConfigured();
  const { endpoint, requestId } = decode(jobId);
  const result = await fal.queue.status(endpoint, { requestId, logs: false }) as { status?: string };
  const status = String(result.status || "");
  return { id: jobId, status: status === "COMPLETED" ? "completed" : status === "ERROR" ? "failed" : "processing" };
}

export async function getFalQueueResult(jobId: string): Promise<any> {
  ensureConfigured();
  const { endpoint, requestId } = decode(jobId);
  return fal.queue.result(endpoint, { requestId });
}

export async function createFalAssembly(videoUrls: string[], resolution = "portrait_16_9", targetFps = 30) {
  if (videoUrls.length < 2) throw new Error("Au moins deux clips sont requis pour l’assemblage");
  const job = await submitFalQueue(MERGE_ENDPOINT, { video_urls: videoUrls, resolution, target_fps: targetFps });
  return { jobId: job, mode: "merge" as const };
}

export async function createFalComposition(tracks: FalAssemblyTrack[]) {
  if (!tracks.length || !tracks.some((track) => track.type === "video" || track.type === "image")) {
    throw new Error("La composition fal nécessite une piste visuelle");
  }
  const job = await submitFalQueue(COMPOSE_ENDPOINT, { tracks });
  return { jobId: job, mode: "compose" as const };
}

export async function getFalMediaUrl(jobId: string) {
  const result = await getFalQueueResult(jobId);
  const url = result?.data?.video?.url || result?.video?.url || result?.data?.video_url || result?.video_url;
  if (typeof url !== "string" || !url) throw new Error("fal n’a renvoyé aucun média");
  return url;
}

export async function downloadFalMedia(jobId: string) {
  const url = await getFalMediaUrl(jobId);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Téléchargement fal impossible : ${response.status}`);
  return { body: await response.arrayBuffer(), contentType: response.headers.get("content-type") || "video/mp4" };
}
