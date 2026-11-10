import { NextResponse } from "next/server";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const topic = "vendeo:admin:invalidate";
const eventName = "admin_data_changed";
const allowedScopes = new Set([
  "signup",
  "billing",
  "credits",
  "campaigns",
  "referrals",
  "payouts",
]);

function scopeFromBroadcast(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;
  const outer = message as Record<string, unknown>;
  const candidates = [outer, outer.payload && typeof outer.payload === "object" ? outer.payload : null];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const scope = (candidate as Record<string, unknown>).scope;
    if (typeof scope === "string" && allowedScopes.has(scope)) return scope;
  }
  return null;
}

export async function GET(request: Request) {
  const { admin, response } = await requireAdmin();
  if (!admin) {
    return (
      response ??
      NextResponse.json({ error: "Accès administrateur requis" }, { status: 403 })
    );
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Flux temps réel indisponible" }, { status: 503 });
  }

  const encoder = new TextEncoder();
  let channel: RealtimeChannel | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let closeStream: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          closeStream?.();
        }
      };

      controller.enqueue(encoder.encode(": connected\n\n"));
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat !== null) clearInterval(heartbeat);
        request.signal.removeEventListener("abort", cleanup);
        if (channel) void supabase.removeChannel(channel).catch(() => {});
        try {
          controller.close();
        } catch {
          // The client may already have cancelled the response stream.
        }
      };
      closeStream = cleanup;
      request.signal.addEventListener("abort", cleanup, { once: true });
      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch {
          cleanup();
        }
      }, 20_000);

      channel = supabase
        .channel(topic, { config: { private: true } })
        .on("broadcast", { event: eventName }, (message) => {
          const scope = scopeFromBroadcast(message);
          if (scope) send("admin-data-changed", { scope });
        })
        .subscribe((status) => {
          if (closed) return;
          if (status === "SUBSCRIBED") {
            send("ready", {});
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            send("realtime-unavailable", {});
            // End this bounded stream so EventSource can reconnect and create
            // a fresh server-side Realtime subscription.
            cleanup();
          }
        });
    },
    cancel() {
      closeStream?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
