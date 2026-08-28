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

const DEFAULT_BASE_URL = "https://api.imole.app/v1";
const DEFAULT_MODEL = "GPT-5.6 Luna";

export function getAiModel() {
  return process.env.IMOLE_MODEL?.trim() || DEFAULT_MODEL;
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
