"use client";

import Link from "next/link";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";

type NotificationItem = { id: string; type: "admin" | "autopilot" | "system"; title: string; body: string; action_url: string | null; read_at: string | null; created_at: string };

function formatDate(value: string, locale: "fr" | "en") {
  return new Date(value).toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function NotificationsView(_props: { onBack: () => void }) {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const unread = items.filter((item) => !item.read_at).length;
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "notifications_load_failed");
      setItems(data.notifications ?? []);
    } catch { setError(locale === "fr" ? "Impossible de charger tes notifications." : "Unable to load your notifications."); }
    finally { setLoading(false); }
  }, [locale]);
  useEffect(() => { void load(); }, [load]);

  async function markRead(id: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }
  async function markAllRead() {
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
  }

  return <div className="notifications-page">
    <section className="app-card notifications-card">
      {unread ? <div className="card-head"><div><h2>{`${unread} ${locale === "fr" ? "non lue(s)" : "unread"}`}</h2></div><button type="button" className="notifications-mark-all" onClick={() => void markAllRead()}><CheckCheck size={15} /> {t("notifications.markAll")}</button></div> : null}
      {loading ? <p className="hint-line">{t("notifications.loading")}</p> : error ? <p className="settings-inline-message settings-account-error">{error}</p> : !items.length ? <div className="notifications-empty"><Bell size={28} /><strong>{t("notifications.empty")}</strong></div> : <div className="notifications-page-list">{items.map((item) => {
        const content = <><div className="notifications-page-item-head"><strong>{item.title}</strong><time>{formatDate(item.created_at, locale)}</time></div><p>{item.body}</p>{item.action_url ? <span className="notification-action"><ExternalLink size={13} /> {t("notifications.open")}</span> : null}</>;
        return item.action_url ? <Link href={item.action_url} key={item.id} className={`notifications-page-item ${item.read_at ? "read" : "unread"}`} onClick={() => void markRead(item.id)}>{content}</Link> : <button type="button" key={item.id} className={`notifications-page-item ${item.read_at ? "read" : "unread"}`} onClick={() => void markRead(item.id)}>{content}</button>;
      })}</div>}
    </section>
  </div>;
}
