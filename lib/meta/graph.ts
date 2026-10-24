export const META_GRAPH_TIMEOUT_MS = 12_000;

export class MetaAuthenticationError extends Error {
  readonly code: number;

  constructor(message: string, code: number) {
    super(message);
    this.name = "MetaAuthenticationError";
    this.code = code;
  }
}

/** Bounds every Graph request, including pagination and endpoints outside api.ts. */
export function fetchMetaGraph(input: RequestInfo | URL, init: RequestInit = {}) {
  const timeout = AbortSignal.timeout(META_GRAPH_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, cache: init.cache ?? "no-store", signal });
}

/** Builds a typed auth failure only for Meta's explicit invalid-token response. */
export function createMetaGraphError(error: unknown, status: number, fallback: string): Error {
  const details = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof details.message === "string" ? details.message : fallback;
  const code = typeof details.code === "number" ? details.code : Number(details.code);
  const type = typeof details.type === "string" ? details.type : "";
  if (code === 190 || (code === 102 && type === "OAuthException")) {
    return new MetaAuthenticationError(message, code);
  }
  return new Error(message || `${fallback} (${status})`);
}

export function isMetaAuthenticationError(error: unknown): error is MetaAuthenticationError {
  return error instanceof MetaAuthenticationError;
}
