type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ImoleResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  output_text?: string;
  output?: string;
  error?: { message?: string };
};

type ImoleImageResponse = {
  data?: Array<{ url?: string; b64_json?: string; image_url?: string }>;
  url?: string;
  image_url?: string;
  error?: { message?: string };
};

type ImoleVideoResponse = {
  id?: string;
  job_id?: string;
  job?: { id?: string };
  error?: { message?: string };
};

type ImoleMediaJobResponse = {
  id?: string;
  status?: string;
  error?: { message?: string };
};

const DEFAULT_BASE_URL = "https://api.imole.app/v1";
const DEFAULT_MODEL = "GPT-5.6 Luna";
const DEFAULT_IMAGE_MODEL = "imole-image";
const DEFAULT_VIDEO_MODEL = "imole-video";

export function getAiModel() {
  return process.env.IMOLE_MODEL?.trim() || DEFAULT_MODEL;
}

export function getAiImageModel() {
  return process.env.IMOLE_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
}

export function getAiVideoModel() {
  return process.env.IMOLE_VIDEO_MODEL?.trim() || DEFAULT_VIDEO_MODEL;
}

function getConfig() {
  const apiKey = process.env.IMOLE_API_KEY;
  if (!apiKey) throw new Error("IMOLE_API_KEY is not configured");
  return {
    apiKey,
    baseUrl: (process.env.IMOLE_API_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: getAiModel(),
  };
}

export async function askImole(messages: ChatMessage[]) {
  const { apiKey, baseUrl, model } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, temperature: 0.4 }),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({})) as ImoleResponse;
    if (!response.ok) throw new Error(data.error?.message || `Imole API returned ${response.status}`);

    const answer = data.choices?.[0]?.message?.content || data.output_text || data.output;
    if (!answer) throw new Error("Imole returned an empty response");
    return answer.trim();
  } finally {
    clearTimeout(timeout);
  }
}

const POSTER_SIZE_BY_FORMAT: Record<string, string> = {
  square: "1024x1024",
  story: "1024x1792",
  banner: "1792x1024",
};

export type StudioImageOptions = {
  orientation?: "square" | "landscape" | "portrait";
  quality?: "medium" | "high" | "xhigh" | "max";
  resolution?: "hd" | "full_hd" | "2k" | "4k";
  imageMode?: "fast" | "advanced";
  background?: "auto" | "opaque" | "transparent";
  outputFormat?: "png" | "jpeg";
};

export async function generateImoleImage(
  prompt: string,
  format: "square" | "story" | "banner" = "square",
  options: StudioImageOptions = {},
) {
  const { apiKey, baseUrl } = getConfig();
  const model = getAiImageModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  const orientation = options.orientation ?? (format === "story" ? "portrait" : format === "banner" ? "landscape" : "square");
  const outputFormat = options.background === "transparent" ? "png" : (options.outputFormat ?? "png");

  try {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        image_mode: options.imageMode ?? "fast",
        quality: options.quality ?? "medium",
        resolution: options.resolution ?? "hd",
        orientation,
        background: options.background ?? "auto",
        output_format: outputFormat,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({})) as ImoleImageResponse;
    if (!response.ok) throw new Error(data.error?.message || `Imole image API returned ${response.status}`);

    const item = data.data?.[0];
    const url = data.url || data.image_url || item?.url || item?.image_url || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
    if (!url) throw new Error("Imole n'a renvoyé aucune image");
    return url;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createImoleVideo(prompt: string, options: { duration: number; resolution: "480p" | "768p"; aspectRatio: string }) {
  const { apiKey, baseUrl } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(`${baseUrl}/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: getAiVideoModel(),
        prompt,
        mode: "text",
        duration: options.duration,
        resolution: options.resolution,
        aspect_ratio: options.aspectRatio,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({})) as ImoleVideoResponse;
    if (!response.ok) throw new Error(data.error?.message || `Imole video API returned ${response.status}`);
    const jobId = data.id || data.job_id || data.job?.id;
    if (!jobId) throw new Error("Imole n'a renvoyé aucun identifiant de génération vidéo");
    return jobId;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getImoleVideoJob(jobId: string) {
  const { apiKey, baseUrl } = getConfig();
  const response = await fetch(`${baseUrl}/media/jobs/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({})) as ImoleMediaJobResponse;
  if (!response.ok) throw new Error(data.error?.message || `Imole media job API returned ${response.status}`);
  return { id: data.id || jobId, status: data.status || "queued" };
}

export async function downloadImoleVideo(jobId: string) {
  const { apiKey, baseUrl } = getConfig();
  const response = await fetch(`${baseUrl}/media/jobs/${encodeURIComponent(jobId)}/content`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
  if (!response.ok) throw new Error(`Imole video content API returned ${response.status}`);
  return { body: await response.arrayBuffer(), contentType: response.headers.get("content-type") || "video/mp4" };
}
