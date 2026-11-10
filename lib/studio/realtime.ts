import { createClient } from "@/lib/supabase/browser";

type WatchOptions = {
  filter: string;
  onChange: () => void | Promise<void>;
  onError?: () => void;
};

/**
 * Watch one owned studio_generations row. Realtime is the primary signal;
 * a single GET after subscription and on foreground return reconciles missed
 * events without periodic client polling.
 */
export function watchStudioGeneration({ filter, onChange, onError }: WatchOptions): () => void {
  let active = true;
  let timer: number | null = null;
  let client: ReturnType<typeof createClient> | null = null;
  let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;

  const isForeground = () =>
    typeof document !== "undefined" &&
    document.visibilityState === "visible" &&
    (typeof document.hasFocus !== "function" || document.hasFocus());

  const refresh = () => {
    if (!active || !isForeground()) return;
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      if (!active) return;
      try {
        void Promise.resolve(onChange()).catch(() => {
          if (active) onError?.();
        });
      } catch {
        if (active) onError?.();
      }
    }, 200);
  };

  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      client = createClient();
      channel = client
        .channel(`studio-generation:${filter.slice(0, 120)}`, { config: { private: true } })
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "studio_generations", filter },
          refresh,
        )
        .subscribe((status) => {
          if (!active) return;
          if (status === "SUBSCRIBED") refresh();
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onError?.();
        });
    } else {
      // Config-less preview/test environments still get one safe reconciliation
      // and focus recovery, but never start an interval.
      refresh();
    }
  } catch {
    onError?.();
    refresh();
  }

  document.addEventListener("visibilitychange", refresh);
  window.addEventListener("focus", refresh);

  return () => {
    active = false;
    if (timer !== null) window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", refresh);
    window.removeEventListener("focus", refresh);
    if (client && channel) void client.removeChannel(channel);
  };
}
