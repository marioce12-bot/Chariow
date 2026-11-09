type ChatAttachment = { url: string; type: "image" | "video" | "document"; name?: string; text?: string };
type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
};
type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> | null } }>;
};
type OpenRouterPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type OpenRouterRequestMessage = { role: ChatMessage["role"]; content: string | OpenRouterPart[] };
type StructuredJsonSchema = { name: string; schema: Record<string, unknown> };

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";
// Modèles de secours essayés par OpenRouter (dans l'ordre) quand le modèle principal est
// limité (429), indisponible ou en erreur. Le 2e est d'une autre famille pour ne pas
// dépendre de la même capacité Google.
const DEFAULT_FALLBACK_MODELS = ["google/gemini-2.5-flash", "openai/gpt-4o-mini"];
const MAX_FALLBACK_MODELS = 2;
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_IMAGES_PER_MESSAGE = 2;

export class OpenRouterApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly retryAfter?: string,
    public readonly upstreamCode?: string,
    public readonly upstreamMessage?: string,
    public readonly upstreamProvider?: string,
  ) {
    super(`OpenRouter API returned ${status}`);
    this.name = "OpenRouterApiError";
  }
}

function safeDiagnostic(value: unknown, maxLength = 240): string | undefined {
  if (typeof value !== "string") return undefined;
  const safe = value.replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/gi, "[redacted]")
    .replace(/\s+/g, " ").trim();
  return safe ? safe.slice(0, maxLength) : undefined;
}

export function getOpenRouterModel() {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * Modèles de secours envoyés à OpenRouter via le paramètre `models`.
 * Variable d'environnement OPENROUTER_FALLBACK_MODELS : liste séparée par des virgules ;
 * vide ou « none » pour désactiver le secours.
 */
export function getOpenRouterFallbackModels(primaryModel: string): string[] {
  const raw = process.env.OPENROUTER_FALLBACK_MODELS;
  const configured = raw === undefined ? DEFAULT_FALLBACK_MODELS : raw.split(",");
  if (configured.length === 1 && configured[0].trim().toLowerCase() === "none") return [];
  return Array.from(new Set(configured.map((model) => model.trim()).filter((model) => model && model !== primaryModel)))
    .slice(0, MAX_FALLBACK_MODELS);
}

function getApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");
  return apiKey;
}

function toOpenRouterMessages(messages: ChatMessage[]): OpenRouterRequestMessage[] {
  return messages.map((message) => {
    const images = message.role === "user"
      ? (message.attachments ?? []).filter((attachment) => attachment.type === "image").slice(0, MAX_IMAGES_PER_MESSAGE)
      : [];
    if (!images.length) return { role: message.role, content: message.content };
    const content: OpenRouterPart[] = [
      { type: "text", text: message.content },
      ...images.map((image) => ({ type: "image_url" as const, image_url: { url: image.url } })),
    ];
    return { role: message.role, content };
  });
}

function waitForRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function askOpenRouter(
  messages: ChatMessage[],
  options: { timeoutMs?: number; model?: string; fallbackModels?: string[]; overloadRetries?: number; requireParameters?: boolean; responseSchema?: StructuredJsonSchema } = {}
) {
  const apiKey = getApiKey();
  const model = options.model?.trim() || getOpenRouterModel();
  const fallbackModels = options.fallbackModels
    ? options.fallbackModels.map((fallback) => fallback.trim()).filter((fallback) => fallback && fallback !== model).slice(0, MAX_FALLBACK_MODELS)
    : getOpenRouterFallbackModels(model);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const retries = Math.min(2, Math.max(0, Math.floor(options.overloadRetries ?? 0)));
  const requestMessages = toOpenRouterMessages(messages);
  const buildBody = (selectedModel: string, remainingFallbacks: string[]) => JSON.stringify({
    model: selectedModel,
    ...(remainingFallbacks.length ? { models: remainingFallbacks } : {}),
    messages: requestMessages,
    temperature: 0.4,
    stream: false,
    ...(options.requireParameters ? { provider: { require_parameters: true } } : {}),
    ...(options.responseSchema ? {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: options.responseSchema.name,
          strict: true,
          schema: options.responseSchema.schema,
        },
      },
    } : {}),
  });

  try {
    modelAttempts: for (let modelIndex = 0; modelIndex <= fallbackModels.length; modelIndex++) {
      const selectedModel = modelIndex === 0 ? model : fallbackModels[modelIndex - 1];
      const remainingFallbacks = fallbackModels.slice(modelIndex);
      const body = buildBody(selectedModel, remainingFallbacks);
      for (let attempt = 0; ; attempt++) {
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const response = await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body,
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) {
          if (response.status === 503 && attempt < retries) {
            await waitForRetry(1000 * 2 ** attempt, controller.signal);
            continue;
          }
          const errorBody = await response.json().catch(() => null) as {
            error?: { code?: string | number; message?: string; metadata?: { provider_name?: string } };
          } | null;
          const upstream = errorBody?.error;
        if ([408, 429, 500, 502, 503, 504].includes(response.status) && modelIndex < fallbackModels.length) {
          continue modelAttempts;
        }
        throw new OpenRouterApiError(
          response.status,
          response.headers.get("retry-after") ?? undefined,
          upstream?.code === undefined ? undefined : String(upstream.code),
          safeDiagnostic(upstream?.message),
          safeDiagnostic(upstream?.metadata?.provider_name, 80),
        );
        }
        const data = (await response.json().catch(() => ({}))) as OpenRouterResponse;
        const content = data.choices?.[0]?.message?.content;
        const answer = typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content.filter((part) => part.type === "text").map((part) => part.text ?? "").join("")
            : "";
        if (!answer.trim()) throw new Error("OpenRouter returned an empty response");
        return answer.trim();
      }
    }
    throw new Error("OpenRouter models exhausted");
  } finally {
    clearTimeout(timeout);
  }
}
