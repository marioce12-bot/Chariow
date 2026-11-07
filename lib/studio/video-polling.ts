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
  fetchStatus: (signal: AbortSignal) => Promise<T>;
  onStatus: (status: T) => void;
  onError?: (error: unknown) => void;
};

export type StudioVideoPollingHandle = {
  refresh: () => void;
  stop: () => void;
};

/** Starts immediately, then waits a full interval after each settled request. */
export function startStudioVideoPolling<T extends { status: string }>(
  options: PollingOptions<T>,
): StudioVideoPollingHandle {
  const intervalMs = options.intervalMs ?? 30_000;
  let stopped = false;
  let inFlight = false;
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
    const controller = new AbortController();
    requestController = controller;
    let terminal = false;
    try {
      const status = await options.fetchStatus(controller.signal);
      if (stopped) return;
      options.onStatus(status);
      terminal = isTerminalStudioVideoStatus(status.status);
    } catch (error) {
      if (!stopped && !controller.signal.aborted) options.onError?.(error);
    } finally {
      inFlight = false;
      if (requestController === controller) requestController = null;
      if (terminal) stop();
      else schedule();
    }
  };

  const refresh = () => {
    if (stopped || inFlight) return;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    void poll();
  };

  void poll();
  return { refresh, stop };
}
