export type TextMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type GroqResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

// Groq expose une API compatible OpenAI — clé à créer sur https://console.groq.com/keys,
// à mettre dans GROQ_API_KEY.
const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-oss-120b";
const DEFAULT_TIMEOUT_MS = 12_000;

export function getGroqModel() {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;
}

export function hasGroqKey() {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

function getConfig() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured");
  return {
    apiKey,
    url: process.env.GROQ_API_URL?.trim() || DEFAULT_BASE_URL,
    model: getGroqModel(),
  };
}

// Certains modèles de raisonnement renvoient leur réflexion entre balises <think>…</think>
// directement dans le contenu : on la retire pour ne garder que la réponse finale.
function stripThinking(value: string) {
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, "")
    .trim();
}

// Texte uniquement (system / user / assistant). Pas de `temperature` ni d'autre paramètre
// optionnel : seuls `model` et `messages` sont envoyés, pour éviter tout 400 sur un
// paramètre non supporté par le modèle choisi.
export async function askGroq(messages: TextMessage[], options: { timeoutMs?: number } = {}) {
  const { apiKey, url, model } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messages.map((message) => ({ role: message.role, content: message.content })),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    // Corps brut : quand Groq refuse la requête (400, 401, 413, 429…), le message n'est pas
    // toujours dans { error: { message } } — on garde un extrait pour les logs.
    const raw = await response.text().catch(() => "");
    let data: GroqResponse = {};
    try {
      data = JSON.parse(raw) as GroqResponse;
    } catch {
      data = {};
    }
    if (!response.ok) {
      const detail = data.error?.message || raw.replace(/\s+/g, " ").trim().slice(0, 300);
      throw new Error(`Groq API returned ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""} (modèle ${model})`);
    }

    const answer = stripThinking(data.choices?.[0]?.message?.content ?? "");
    if (!answer) throw new Error("Groq returned an empty response");
    return answer;
  } finally {
    clearTimeout(timeout);
  }
}
