export const FAL_VIDEO_PROMPT_MAX_CHARS = 4_096;
export const FAL_VIDEO_PROMPT_SAFE_MAX_CHARS = 3_600;

export type FalVideoInputRejectCode =
  | "STUDIO_VIDEO_PROMPT_TOO_LONG"
  | "STUDIO_VIDEO_PROVIDER_INPUT_REJECTED";

export class FalVideoInputRejectedError extends Error {
  readonly code: FalVideoInputRejectCode;
  readonly httpStatus?: number;

  constructor(code: FalVideoInputRejectCode, message: string, httpStatus?: number) {
    super(message);
    this.name = "FalVideoInputRejectedError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** Counts Unicode code points, matching human-visible characters rather than UTF-16 units. */
export function countFalVideoPromptCharacters(prompt: string) {
  return Array.from(prompt).length;
}

/** Keep a safety margin below Fal's documented 4,096-character validation ceiling. */
export function assertFalVideoPromptWithinSafeLimit(prompt: string) {
  const characters = countFalVideoPromptCharacters(prompt);
  if (characters > FAL_VIDEO_PROMPT_SAFE_MAX_CHARS) {
    throw new FalVideoInputRejectedError(
      "STUDIO_VIDEO_PROMPT_TOO_LONG",
      `Video segment prompt exceeds the safe ${FAL_VIDEO_PROMPT_SAFE_MAX_CHARS}-character limit.`,
    );
  }
}

export function isFalVideoInputRejectedError(error: unknown): error is FalVideoInputRejectedError {
  if (error instanceof FalVideoInputRejectedError) return true;
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "STUDIO_VIDEO_PROMPT_TOO_LONG" || code === "STUDIO_VIDEO_PROVIDER_INPUT_REJECTED";
}

/** Convert only explicit provider validation responses; transport/unknown errors remain ambiguous. */
export function falVideoInputRejectedErrorFrom(error: unknown): FalVideoInputRejectedError | null {
  const seen = new Set<object>();
  const pending: unknown[] = [error];
  while (pending.length) {
    const current = pending.shift();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const value = current as {
      status?: unknown;
      statusCode?: unknown;
      response?: { status?: unknown };
      cause?: unknown;
    };
    const status = [value.status, value.statusCode, value.response?.status].find(
      (candidate): candidate is number => typeof candidate === "number",
    );
    if (status === 422) {
      return new FalVideoInputRejectedError(
        "STUDIO_VIDEO_PROVIDER_INPUT_REJECTED",
        "The video provider rejected the request during input validation (HTTP 422).",
        status,
      );
    }
    if (value.cause) pending.push(value.cause);
  }
  return null;
}
