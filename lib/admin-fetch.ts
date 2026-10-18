export const ADMIN_READ_TIMEOUT_MS = 15_000;

/** Bounded reads only. Mutations must never be automatically retried. */
export async function fetchAdminJson<T = any>(
  url: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => {
      controller.abort();
      reject(new DOMException("Aborted", "AbortError"));
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("admin_read_timeout"));
    }, options.timeoutMs ?? ADMIN_READ_TIMEOUT_MS);
  });
  try {
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        let payload: any;
        try { payload = await response.json(); }
        catch { throw new Error("admin_read_invalid"); }
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) throw new Error("admin_read_session");
          throw new Error("admin_read_failed");
        }
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("admin_read_invalid");
        return payload as T;
      })(),
      interrupted,
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) options.signal?.removeEventListener("abort", onAbort);
  }
}

export function adminReadError(cause: unknown, locale: string): string {
  const code = cause instanceof Error ? cause.message : "";
  if (code === "admin_read_timeout") return locale === "en"
    ? "The request took too long. Please retry."
    : "Le chargement a pris trop de temps. Veuillez réessayer.";
  if (code === "admin_read_session") return locale === "en"
    ? "Your admin session has expired or access was denied. Sign in again."
    : "Votre session administrateur a expiré ou l’accès est refusé. Reconnectez-vous.";
  return locale === "en" ? "Unable to load this data. Please retry." : "Impossible de charger ces données. Veuillez réessayer.";
}
