"use client";

import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export function NotificationCenter({ onOpen }: { onOpen: () => void }) {
  const [unread, setUnread] = useState(0);
  const NOTIFICATION_POLL_MS = 60_000;
  const load = useCallback(async () => {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setUnread(Number(data.unreadCount ?? 0));
  }, []);
  useEffect(() => {
    let lastLoadedAt = 0;
    const foreground = () => document.visibilityState === "visible" && document.hasFocus();
    const refreshIfDue = () => {
      if (!foreground() || Date.now() - lastLoadedAt < NOTIFICATION_POLL_MS) return;
      lastLoadedAt = Date.now();
      void load();
    };
    refreshIfDue();
    const timer = window.setInterval(refreshIfDue, NOTIFICATION_POLL_MS);
    document.addEventListener("visibilitychange", refreshIfDue);
    window.addEventListener("focus", refreshIfDue);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfDue);
      window.removeEventListener("focus", refreshIfDue);
    };
  }, [load]);
  return (
    <button type="button" className="notification-trigger" aria-label="Notifications" onClick={onOpen}>
      <Bell size={17} />
      {unread > 0 ? <span className="notification-count">{unread > 99 ? "99+" : unread}</span> : null}
    </button>
  );
}
