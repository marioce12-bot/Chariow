import { askGemini } from "@/lib/ai/gemini";
import { askGroq, hasGroqKey, type TextMessage } from "@/lib/ai/groq";
import { askImole } from "@/lib/ai/imole";
import { askOpenRouter } from "@/lib/ai/openrouter";

export type TextProvider = "groq" | "imole" | "gemini" | "openrouter";
export type StructuredJsonSchema = { name: string; schema: Record<string, unknown> };

const DEFAULT_ORDER: TextProvider[] = ["groq", "imole", "gemini"];

const PROVIDERS: Record<TextProvider, (messages: TextMessage[], responseSchema?: StructuredJsonSchema, model?: string, timeoutMs?: number) => Promise<string>> = {
  groq: (messages, responseSchema) => askGroq(messages, { responseSchema }),
  imole: (messages) => askImole(messages),
  gemini: (messages, responseSchema) => askGemini(messages, { responseSchema: responseSchema?.schema }),
  openrouter: (messages, responseSchema, model, timeoutMs) => askOpenRouter(messages, { responseSchema, model, timeoutMs }),
};

export class TextProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly failedProviders: TextProvider[] = [],
    readonly retryAfter?: string,
    readonly timedOut = false,
    readonly providerErrorCode?: string,
    readonly providerErrorMessage?: string,
    readonly upstreamProvider?: string,
  ) {
    super(message);
    this.name = "TextProviderError";
  }
}

function getHttpStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number" && Number.isInteger(status)) return status;
  }
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = message.match(/(?:returned|status)\s+(\d{3})/i);
  return match ? Number(match[1]) : undefined;
}

function getRetryAfter(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("retryAfter" in error)) return undefined;
  const value = (error as { retryAfter?: unknown }).retryAfter;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// Génération texte avec secours en cascade. Les logs ne contiennent ni la réponse
// du modèle ni le détail brut de l'erreur fournisseur : uniquement fournisseur, type et statut.
export async function askText(messages: TextMessage[], options: { order?: TextProvider[]; responseSchema?: StructuredJsonSchema; model?: string; timeoutMs?: number } = {}) {
  const order = Array.from(new Set(options.order?.length ? options.order : DEFAULT_ORDER));
  const failures: TextProvider[] = [];
  let lastStatus: number | undefined;
  let lastRetryAfter: string | undefined;
  let lastProviderErrorCode: string | undefined;
  let lastProviderErrorMessage: string | undefined;
  let lastUpstreamProvider: string | undefined;
  let timedOut = false;

  for (const provider of order) {
    if (provider === "groq" && !hasGroqKey()) continue;
    try {
      const answer = await PROVIDERS[provider](messages, options.responseSchema, options.model, options.timeoutMs);
      if (answer?.trim()) return answer.trim();
      throw new Error("empty response");
    } catch (error) {
      lastStatus = getHttpStatus(error);
      lastRetryAfter = getRetryAfter(error);
      if (error && typeof error === "object") {
        const providerError = error as { upstreamCode?: unknown; upstreamMessage?: unknown; upstreamProvider?: unknown };
        lastProviderErrorCode = typeof providerError.upstreamCode === "string" ? providerError.upstreamCode : undefined;
        lastProviderErrorMessage = typeof providerError.upstreamMessage === "string" ? providerError.upstreamMessage : undefined;
        lastUpstreamProvider = typeof providerError.upstreamProvider === "string" ? providerError.upstreamProvider : undefined;
      }
      timedOut ||= error instanceof Error && (error.name === "AbortError" || /timed?\s*out|timeout/i.test(error.message));
      const errorType = error instanceof Error ? error.name : "unknown_error";
      console.error(`AI text provider error (${provider})`, {
        status: lastStatus ?? null, errorType,
        ...(provider === "openrouter" ? {
          upstreamCode: lastProviderErrorCode ?? null,
          upstreamMessage: lastProviderErrorMessage ?? null,
          upstreamProvider: lastUpstreamProvider ?? null,
          retryAfter: lastRetryAfter ?? null,
        } : {}),
      });
      failures.push(provider);
    }
  }

  const message = failures.length
    ? `Tous les fournisseurs IA texte ont échoué (${failures.join(", ")})`
    : "Aucun fournisseur IA texte n'est disponible";
  throw new TextProviderError(message, lastStatus, failures, lastRetryAfter, timedOut, lastProviderErrorCode, lastProviderErrorMessage, lastUpstreamProvider);
}
