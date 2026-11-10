import type { SupabaseClient } from "@supabase/supabase-js";

let nextNotificationChannelId = 0;

type NotificationInsert = {
  id?: unknown;
  user_id?: unknown;
  type?: unknown;
  title?: unknown;
  body?: unknown;
  action_url?: unknown;
  metadata?: unknown;
  read_at?: unknown;
  created_at?: unknown;
};

export type RealtimeNotification = {
  id: string;
  user_id: string;
  type: "admin" | "autopilot" | "system";
  title: string;
  body: string;
  action_url: string | null;
  metadata?: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

function asNotification(value: unknown, userId: string): RealtimeNotification | null {
  if (!value || typeof value !== "object") return null;
  const row = value as NotificationInsert;
  if (row.user_id !== userId || typeof row.id !== "string" || typeof row.title !== "string" || typeof row.body !== "string" || typeof row.created_at !== "string") return null;
  const type = row.type === "admin" || row.type === "autopilot" || row.type === "system" ? row.type : "system";
  return {
    id: row.id,
    user_id: userId,
    type,
    title: row.title,
    body: row.body,
    action_url: typeof row.action_url === "string" ? row.action_url : null,
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : null,
    read_at: typeof row.read_at === "string" ? row.read_at : null,
    created_at: row.created_at,
  };
}

export function subscribeUserNotifications(
  client: SupabaseClient,
  userId: string,
  onInsert: (notification: RealtimeNotification) => void,
  onStatus?: (status: string) => void,
) {
  let active = true;
  const seen = new Set<string>();
  // Supabase returns an existing channel for a repeated topic. The dashboard
  // header and the notifications page can be mounted at the same time, so
  // each subscriber needs a distinct topic before registering callbacks.
  const channel = client.channel(`user-notifications:${userId}:${++nextNotificationChannelId}`, { config: { private: true } })
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "user_notifications",
      filter: `user_id=eq.${userId}`,
    }, (payload) => {
      if (!active) return;
      const notification = asNotification((payload as { new?: unknown }).new, userId);
      if (!notification || seen.has(notification.id)) return;
      seen.add(notification.id);
      if (seen.size > 200) seen.delete(seen.values().next().value!);
      onInsert(notification);
    })
    .subscribe((status) => { if (active) onStatus?.(status); });
  return () => {
    active = false;
    void Promise.resolve(client.removeChannel(channel)).catch(() => {});
  };
}
