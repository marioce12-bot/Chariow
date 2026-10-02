"use client";

import Link from "next/link";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";

type NotificationItem = {
  id: string;
  type: "admin" | "autopilot" | "system";
  title: string;
  body: string;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

function relativeDate(value: string, en: boolean) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return en ? "Just now" : "À l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return en ? `${minutes} min ago` : `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return en ? `${hours} h ago` : `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return en ? `${days} d ago` : `Il y a ${days} j`;
}

export function NotificationCenter() {
  const { locale } = useI18n();
  const en = locale === "en";
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(data.notifications)) setItems(data.notifications);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const unread = items.filter((item) => !item.read_at).length;
  async function markRead(id: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }
  async function markAllRead() {
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
  }

  return (
    <div className="notification-center">
      <button type="button" className="notification-trigger" aria-label={en ? "Notifications" : "Notifications"} aria-expanded={open} onClick={() => { setOpen((value) => !value); if (!open) void load(); }}>
        <Bell size={17} />
        {unread > 0 ? <span className="notification-count">{unread > 99 ? "99+" : unread}</span> : null}
      </button>
      {open ? (
        <>
          <button type="button" className="notification-backdrop" aria-label={en ? "Close notifications" : "Fermer les notifications"} onClick={() => setOpen(false)} />
          <section className="notification-panel" aria-label={en ? "Notification center" : "Centre de notifications"}>
            <div className="notification-panel-head">
              <div><span className="eyebrow">{en ? "Updates" : "Actualités"}</span><h2>{en ? "Notifications" : "Notifications"}</h2></div>
              {unread ? <button type="button" className="notification-mark-all" onClick={() => void markAllRead()}><CheckCheck size={14} /> {en ? "Mark all read" : "Tout marquer comme lu"}</button> : null}
            </div>
            <div className="notification-list">
              {loading && !items.length ? <p className="notification-empty">{en ? "Loading…" : "Chargement…"}</p> : null}
              {!loading && !items.length ? <p className="notification-empty">{en ? "You have no notifications." : "Tu n'as aucune notification."}</p> : null}
              {items.map((item) => {
                const content = <><div className="notification-item-top"><strong>{item.title}</strong><span>{relativeDate(item.created_at, en)}</span></div><p>{item.body}</p>{item.action_url ? <span className="notification-action"><ExternalLink size={12} /> {en ? "Open" : "Ouvrir"}</span> : null}</>;
                return item.action_url ? <Link href={item.action_url} key={item.id} className={`notification-item ${item.read_at ? "read" : "unread"}`} onClick={() => void markRead(item.id)}>{content}</Link> : <button type="button" key={item.id} className={`notification-item ${item.read_at ? "read" : "unread"}`} onClick={() => void markRead(item.id)}>{content}</button>;
              })}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
