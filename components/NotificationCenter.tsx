"use client";

import { MessageSquare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { subscribeUserNotifications } from "@/lib/notifications/realtime";

const NOTIFICATION_FALLBACK_POLL_MS = 60_000;

export function NotificationCenter({ onOpen, userId }: { onOpen: () => void; userId?: string | null }) {
  const [unread, setUnread] = useState(0);
  const lastLoadedAt = useRef(0);
  const load = useCallback(async () => {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      lastLoadedAt.current = Date.now();
      setUnread(Number(data.unreadCount ?? 0));
    }
  }, []);

  // One initial read is still needed to establish the current count. New rows
  // then arrive through Realtime instead of repeatedly downloading 50 rows.
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!userId) return;
    const client = createClient();
    return subscribeUserNotifications(client, userId, () => {
      setUnread((count) => count + 1);
    }, (status) => {
      if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && document.visibilityState === "visible") void load();
    });
  }, [load, userId]);

  // Temporary safety net while the session identity is being established. Once
  // Dashboard passes userId, Realtime owns updates and this interval disappears.
  useEffect(() => {
    if (userId) return;
    const foreground = () => document.visibilityState === "visible" && document.hasFocus();
    const refreshIfDue = () => {
      if (!foreground() || Date.now() - lastLoadedAt.current < NOTIFICATION_FALLBACK_POLL_MS) return;
      void load();
    };
    const timer = window.setInterval(refreshIfDue, NOTIFICATION_FALLBACK_POLL_MS);
    document.addEventListener("visibilitychange", refreshIfDue);
    window.addEventListener("focus", refreshIfDue);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfDue);
      window.removeEventListener("focus", refreshIfDue);
    };
  }, [load, userId]);

  return (
    <button type="button" className="notification-trigger" aria-label="Messages" title="Messages" onClick={onOpen}>
      <MessageSquare size={17} />
      {unread > 0 ? <span className="notification-count">{unread > 99 ? "99+" : unread}</span> : null}
    </button>
  );
}
