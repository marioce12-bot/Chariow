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

const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_IMAGES_PER_MESSAGE = 2;

export class OpenRouterApiError extends Error {
  constructor(public readonly status: number) {
    super(`OpenRouter API returned ${status}`);
    this.name = "OpenRouterApiError";
  }
}

export function getOpenRouterModel() {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
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
  options: { timeoutMs?: number; model?: string; overloadRetries?: number } = {}
) {
  const apiKey = getApiKey();
  const model = options.model?.trim() || getOpenRouterModel();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const retries = Math.min(2, Math.max(0, Math.floor(options.overloadRetries ?? 0)));
  const body = JSON.stringify({
    model,
    messages: toOpenRouterMessages(messages),
    temperature: 0.4,
    stream: false,
  });

  try {
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
        throw new OpenRouterApiError(response.status);
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
  } finally {
    clearTimeout(timeout);
  }
}
