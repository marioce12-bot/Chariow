type ChatAttachment = { url: string; type: "image" | "video" | "document"; name?: string; text?: string };

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

// L'API Gemini (Google AI Studio) a un palier gratuit généreux — clé à créer sur
// https://aistudio.google.com/apikey, à mettre dans GEMINI_API_KEY.
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.0-flash";
const DEFAULT_TIMEOUT_MS = 25_000;

// Gemini ne peut pas aller lire une URL externe lui-même : contrairement à Imole
// (compatible OpenAI, qui accepte une part "image_url" pointant vers l'URL), il
// faut lui fournir les octets de l'image en base64 (inline_data). On les
// télécharge donc côté serveur, avec un budget de taille/temps pour ne pas
// bloquer la réponse du chat.
const MAX_INLINE_IMAGE_BYTES = 4_000_000;
const MAX_IMAGES_PER_MESSAGE = 2;

export function getGeminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

function getConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  return {
    apiKey,
    baseUrl: (process.env.GEMINI_API_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: getGeminiModel(),
  };
}

async function fetchImageAsInlinePart(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const contentType = (response.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!contentType.startsWith("image/")) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_INLINE_IMAGE_BYTES) return null;
    return { inline_data: { mime_type: contentType, data: buffer.toString("base64") } };
  } catch {
    // Une image indisponible ne doit pas faire échouer toute la réponse du chat.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Gemini n'a pas de rôle "system" dans le tableau de messages : les messages
// system vont dans systemInstruction, et les rôles user/assistant deviennent
// user/model dans "contents". Les pièces jointes image sont ajoutées comme
// parts inline_data supplémentaires sur le tour concerné. Les documents
// (pdf/docx) ne sont pas envoyés ici : leur texte est déjà intégré au contexte
// système par app/api/chat/route.ts.
async function toGeminiPayload(messages: ChatMessage[]) {
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents = await Promise.all(
    messages
      .filter((m) => m.role !== "system")
      .map(async (m) => {
        const images = (m.attachments ?? []).filter((a) => a.type === "image").slice(0, MAX_IMAGES_PER_MESSAGE);
        const imageParts = images.length
          ? (await Promise.all(images.map((image) => fetchImageAsInlinePart(image.url)))).filter(
              (part): part is { inline_data: { mime_type: string; data: string } } => part !== null
            )
          : [];
        return {
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }, ...imageParts],
        };
      })
  );

  return {
    contents,
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    generationConfig: { temperature: 0.4 },
  };
}

// `timeoutMs` permet à l'appelant d'ajuster l'attente au temps qu'il lui reste avant la
// limite de sa propre fonction (voir maxDuration dans app/api/chat/route.ts).
export async function askGemini(messages: ChatMessage[], options: { timeoutMs?: number } = {}) {
  const { apiKey, baseUrl, model } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const payload = await toGeminiPayload(messages);
    const response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = (await response.json().catch(() => ({}))) as GeminiResponse;
    if (!response.ok) throw new Error(data.error?.message || `Gemini API returned ${response.status}`);

    const answer = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    if (!answer.trim()) throw new Error("Gemini returned an empty response");
    return answer.trim();
  } finally {
    clearTimeout(timeout);
  }
}
