"use client";

import { localizeSystemMessage } from "@/lib/i18n/system-messages";
import Link from "next/link";
import { ArrowRight, Bell, BookOpen, CheckCheck, ExternalLink, MessageSquare, Send, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { createClient } from "@/lib/supabase/browser";
import { subscribeUserNotifications, type RealtimeNotification } from "@/lib/notifications/realtime";
import { TrainingInvitation } from "@/components/TrainingInvitation";

type NotificationItem = { id: string; type: "admin" | "autopilot" | "system"; title: string; body: string; action_url: string | null; category?: string; replies_enabled?: boolean; read_at: string | null; created_at: string };

function formatDate(value: string, locale: "fr" | "en") {
  return new Date(value).toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function NotificationsView({ onBack, userId, experienceLevel, subscription }: { onBack: () => void; userId?: string | null; experienceLevel?: string | null; subscription?: { status?: string; trial_active?: boolean } | null }) {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyId, setReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "announcement" | "training" | "update">("all");
  const [trainingPreviewOpen, setTrainingPreviewOpen] = useState(false);
  const unread = items.filter((item) => !item.read_at).length;
  const visibleItems = items.filter((item) => filter === "all" || (filter === "unread" ? !item.read_at : item.category === filter));
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "notifications_load_failed");
      setItems(data.notifications ?? []);
    } catch { setError(t("adminExtra.notifications.loadError")); }
    finally { setLoading(false); }
  }, [locale]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!userId) return;
    return subscribeUserNotifications(createClient(), userId, (notification: RealtimeNotification) => {
      setItems((current) => current.some((item) => item.id === notification.id) ? current : [notification, ...current].slice(0, 50));
    }, (status) => {
      if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && document.visibilityState === "visible") void load();
    });
  }, [load, userId]);

  async function markRead(id: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  }
  async function markAllRead() {
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
  }
  async function sendReply(notificationId: string) {
    if (!replyText.trim()) return;
    setReplyMessage("");
    const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notification_id: notificationId, body: replyText }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setReplyMessage(data.error || t("adminExtra.notifications.loadError")); return; }
    setReplyText(""); setReplyId(null); setReplyMessage(locale === "en" ? "Reply sent." : "Réponse envoyée.");
  }

  return <div className="notifications-page">
    <style>{`.mobile-nav{display:none !important}`}</style>
    <div className="page-top notifications-page-head">
      <div><span className="eyebrow"><MessageSquare size={14} /> {locale === "en" ? "YOUR MESSAGES" : "TES MESSAGES"}</span><h1>{locale === "en" ? "Messages" : "Messages"}</h1><p>{locale === "en" ? "Find your welcome messages, training and important Vendeo updates here." : "Retrouve ici tes messages de bienvenue, formations et informations importantes de Vendeo."}</p></div>
      <button type="button" className="mobile-back-button" onClick={onBack}><ArrowRight size={15} style={{ transform: "rotate(180deg)" }} /> {t("adminExtra.notifications.back")}</button>
    </div>
    {experienceLevel && ["beginner", "some_experience"].includes(experienceLevel) ? <>
      <section className="training-message-card" aria-labelledby="training-message-title">
        <span className="training-message-icon"><BookOpen size={20} /></span>
        <div><span className="eyebrow">{locale === "en" ? "TRAINING" : "FORMATION"}</span><h2 id="training-message-title">{locale === "en" ? "Training pack" : "Pack formation"}</h2><p>{locale === "en" ? "Learn the essentials of the digital-product business with the training included in your subscription." : "Apprends les bases du business des produits digitaux grâce à la formation incluse dans ton abonnement."}</p></div>
        <button type="button" className="btn btn-ghost training-preview-button" onClick={() => setTrainingPreviewOpen((open) => !open)}>{trainingPreviewOpen ? <><X size={15} /> {locale === "en" ? "Close preview" : "Fermer l’aperçu"}</> : <><BookOpen size={15} /> {locale === "en" ? "View preview" : "Voir l’aperçu"}</>}</button>
      </section>
      {trainingPreviewOpen ? <TrainingInvitation experienceLevel={experienceLevel} subscription={subscription} /> : null}
    </> : null}
    <section className="app-card notifications-card">
      <div className="messages-toolbar"><div className="messages-filters" role="group" aria-label={locale === "en" ? "Message filters" : "Filtres des messages"}>{(["all", "unread", "announcement", "training", "update"] as const).map((value) => <button type="button" key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{({ all: locale === "en" ? "All" : "Tous", unread: locale === "en" ? "Unread" : "Non lus", announcement: locale === "en" ? "Announcements" : "Annonces", training: locale === "en" ? "Training" : "Formations", update: locale === "en" ? "Updates" : "Nouveautés" }[value])}</button>)}</div>{unread ? <button type="button" className="notifications-mark-all" onClick={() => void markAllRead()}><CheckCheck size={15} /> {t("adminExtra.notifications.markAll")}</button> : null}</div>
      {loading ? <p className="hint-line">{t("adminExtra.notifications.loading")}</p> : error ? <p className="settings-inline-message settings-account-error">{localizeSystemMessage(error, locale)}</p> : !visibleItems.length ? <div className="notifications-empty"><Bell size={28} /><strong>{t("adminExtra.notifications.empty")}</strong></div> : <div className="notifications-page-list" aria-label={t("adminExtra.notifications.list")}>{visibleItems.map((item) => {
        const content = <><div className="notifications-page-item-head"><strong>{item.title}</strong><span className="notifications-read-state">{item.category ? item.category : "general"} · {item.read_at ? (t("adminExtra.notifications.read")) : (t("adminExtra.notifications.unread"))}</span></div><time className="notifications-item-date" dateTime={item.created_at}>{formatDate(item.created_at, locale)}</time><p>{item.body}</p>{item.action_url ? <Link href={item.action_url} className="notification-action" onClick={() => void markRead(item.id)}><ExternalLink size={13} /> {t("notifications.open")}</Link> : null}{item.replies_enabled ? <button type="button" className="notifications-reply-button" onClick={(event) => { event.stopPropagation(); setReplyId(replyId === item.id ? null : item.id); setReplyMessage(""); void markRead(item.id); }}>{locale === "en" ? "Reply" : "Répondre"}</button> : null}{replyId === item.id ? <form className="notifications-reply-form" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); void sendReply(item.id); }} onClick={(event) => event.stopPropagation()}><textarea value={replyText} onChange={(event) => setReplyText(event.target.value)} maxLength={2000} placeholder={locale === "en" ? "Your reply…" : "Ta réponse…"} required /><button type="submit"><Send size={13} /> {locale === "en" ? "Send" : "Envoyer"}</button></form> : null}{replyMessage && replyId === null ? <small className="notifications-reply-status">{replyMessage}</small> : null}</>;
        return <article key={item.id} className={`notifications-page-item ${item.read_at ? "read" : "unread"}`} onClick={() => void markRead(item.id)}>{content}</article>;
      })}</div>}
    </section>
  </div>;
}
