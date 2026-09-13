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
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message?: string };
};

const DEFAULT_BASE_URL = "https://api.imole.app/v1";
const DEFAULT_MODEL = "GPT-5.6 Luna";
const DEFAULT_IMAGE_MODEL = "GPT-Image-1";

export function getAiModel() {
  return process.env.IMOLE_MODEL?.trim() || DEFAULT_MODEL;
}

export function getAiImageModel() {
  return process.env.IMOLE_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
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

// Génération d'images (affiches produit) via le point de terminaison Imole
// compatible OpenAI "images/generations". Le modèle d'image exact dépend du
// compte Imole configuré — surchageable via IMOLE_IMAGE_MODEL si le modèle
// par défaut n'est pas disponible sur le compte.
export async function generateImoleImage(prompt: string, format: "square" | "story" | "banner" = "square") {
  const { apiKey, baseUrl } = getConfig();
  const model = getAiImageModel();
  const size = POSTER_SIZE_BY_FORMAT[format] ?? POSTER_SIZE_BY_FORMAT.square;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, prompt, size, n: 1 }),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({})) as ImoleImageResponse;
    if (!response.ok) throw new Error(data.error?.message || `Imole image API returned ${response.status}`);

    const item = data.data?.[0];
    const url = item?.url || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
    if (!url) throw new Error("Imole n'a renvoyé aucune image");
    return url;
  } finally {
    clearTimeout(timeout);
  }
}
