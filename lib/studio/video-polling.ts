export type StudioVideoStatus = {
  id: string;
  status: string;
  contentUrl?: string | null;
  error?: string;
  progress?: number;
  phase?: string;
};

const TERMINAL_VIDEO_STATUSES = new Set(["ready", "completed", "failed", "cancelled"]);

export function isTerminalStudioVideoStatus(status: string): boolean {
  return TERMINAL_VIDEO_STATUSES.has(status.toLowerCase());
}

export function normalizeStudioVideoStatus(fallbackId: string, value: unknown): StudioVideoStatus | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.status !== "string") return null;
  const id = typeof record.id === "string" && record.id
    ? record.id
    : typeof record.jobId === "string" && record.jobId
      ? record.jobId
      : fallbackId;
  const status = record.status.toLowerCase();
  const contentUrl = typeof record.contentUrl === "string" ? record.contentUrl : null;
  const rawProgress = typeof record.progress === "number" && Number.isFinite(record.progress) ? record.progress : 0;
  const readyWithMedia = ["ready", "completed"].includes(status) && Boolean(contentUrl);
  return {
    id,
    status,
    contentUrl,
    ...(typeof record.error === "string" ? { error: record.error } : {}),
    ...(typeof record.phase === "string" ? { phase: record.phase } : {}),
    progress: readyWithMedia ? 100 : Math.min(99, Math.max(0, rawProgress)),
  };
}

type PollingOptions<T extends { status: string }> = {
  intervalMs?: number;
  /** Une vérification qui ne répond pas dans ce délai est abandonnée puis reprogrammée. */
  requestTimeoutMs?: number;
  fetchStatus: (signal: AbortSignal) => Promise<T>;
  onStatus: (status: T) => void;
  onError?: (error: unknown) => void;
};

export type StudioVideoPollingHandle = {
  refresh: () => void;
  stop: () => void;
};

/** Une requête restée sans réponse (réseau mobile coupé, onglet gelé) ne doit jamais bloquer le suivi. */
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
/** Au retour au premier plan, une requête plus ancienne que ce délai est considérée comme bloquée. */
const STALE_REFRESH_AFTER_MS = 10_000;

/** Starts immediately, then waits a full interval after each settled request. */
export function startStudioVideoPolling<T extends { status: string }>(
  options: PollingOptions<T>,
): StudioVideoPollingHandle {
  const intervalMs = options.intervalMs ?? 30_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  let stopped = false;
  let inFlight = false;
  let inFlightSince = 0;
  let pollAgainNow = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let requestController: AbortController | null = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    requestController?.abort();
  };

  const schedule = () => {
    if (stopped || inFlight || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void poll();
    }, intervalMs);
  };

  const poll = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    inFlightSince = Date.now();
    const controller = new AbortController();
    requestController = controller;
    let terminal = false;
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
    // Rejette dès que la requête est abandonnée, même si fetchStatus ignore le signal.
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    });
    aborted.catch(() => undefined);
    try {
      const status = await Promise.race([options.fetchStatus(controller.signal), aborted]);
      if (stopped) return;
      options.onStatus(status);
      terminal = isTerminalStudioVideoStatus(status.status);
    } catch (error) {
      // Un abandon volontaire (timeout ou retour au premier plan) n'est pas une erreur à afficher.
      if (!stopped && !controller.signal.aborted) options.onError?.(error);
    } finally {
      clearTimeout(timeout);
      inFlight = false;
      if (requestController === controller) requestController = null;
      if (terminal) stop();
      else if (pollAgainNow && !stopped) { pollAgainNow = false; void poll(); }
      else schedule();
    }
  };

  const refresh = () => {
    if (stopped) return;
    if (inFlight) {
      // Requête bloquée depuis trop longtemps : on l'abandonne et on relance tout de suite.
      if (Date.now() - inFlightSince >= STALE_REFRESH_AFTER_MS) {
        pollAgainNow = true;
        requestController?.abort();
      }
      return;
    }
    if (timer !== null) clearTimeout(timer);
    timer = null;
    void poll();
  };

  void poll();
  return { refresh, stop };
}
