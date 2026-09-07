type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

// L'API Gemini (Google AI Studio) a un palier gratuit généreux — clé à créer sur
// https://aistudio.google.com/apikey, à mettre dans GEMINI_API_KEY.
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.0-flash";

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

// Gemini n'a pas de rôle "system" dans le tableau de messages : les messages
// system vont dans systemInstruction, et les rôles user/assistant deviennent
// user/model dans "contents".
function toGeminiPayload(messages: ChatMessage[]) {
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  return {
    contents,
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    generationConfig: { temperature: 0.4 },
  };
}

export async function askGemini(messages: ChatMessage[]) {
  const { apiKey, baseUrl, model } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await fetch(`${baseUrl}/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toGeminiPayload(messages)),
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
