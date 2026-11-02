import type { UgcPromptGenerationError } from "@/lib/studio/ugc-prompt-generator";

function safeRetryAfter(value?: string): string | undefined {
  const candidate = value?.trim();
  if (!candidate || candidate.length > 128 || /[\r\n]/.test(candidate)) return undefined;
  if (/^\d+$/.test(candidate) && Number.isSafeInteger(Number(candidate))) return candidate;
  return Number.isFinite(Date.parse(candidate)) ? candidate : undefined;
}

export function ugcProviderRateLimitResponse(error: UgcPromptGenerationError, locale?: unknown) {
  if (error.details.httpStatus !== 429) return null;
  const retryAfter = safeRetryAfter(error.details.retryAfter);
  const english = locale === "en";
  let waitInstruction: string;
  if (!retryAfter) {
    waitInstruction = english
      ? "No wait time was supplied; wait before trying again rather than retrying immediately."
      : "Aucun délai n’a été communiqué : attends avant de réessayer, sans relancer immédiatement.";
  } else if (/^\d+$/.test(retryAfter)) {
    const seconds = Number(retryAfter);
    waitInstruction = english
      ? `Wait at least ${seconds} second${seconds === 1 ? "" : "s"} before trying again.`
      : `Attends au moins ${seconds} seconde${seconds === 1 ? "" : "s"} avant de réessayer.`;
  } else {
    waitInstruction = english
      ? `Wait until ${retryAfter} before trying again.`
      : `Attends jusqu’au ${retryAfter} avant de réessayer.`;
  }
  const message = english
    ? `The AI text provider is temporarily rate limited (HTTP 429). ${waitInstruction} No automatic retry was made and no rendering was started.`
    : `Le fournisseur IA est temporairement limité (HTTP 429). ${waitInstruction} Aucune relance automatique n’a été faite et aucun rendu n’a été lancé.`;
  return {
    body: {
      error: message,
      code: "STUDIO_UGC_PROVIDER_RATE_LIMITED",
      httpStatus: 429,
      retryAfter: retryAfter ?? null,
    },
    headers: {
      "Cache-Control": "no-store",
      ...(retryAfter ? { "Retry-After": retryAfter } : {}),
    },
  };
}
