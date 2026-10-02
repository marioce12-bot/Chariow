"use client";

import { Bell } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export function NotificationCenter({ onOpen }: { onOpen: () => void }) {
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setUnread(Number(data.unreadCount ?? 0));
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);
  return (
    <button type="button" className="notification-trigger" aria-label="Notifications" onClick={onOpen}>
      <Bell size={17} />
      {unread > 0 ? <span className="notification-count">{unread > 99 ? "99+" : unread}</span> : null}
    </button>
  );
}
