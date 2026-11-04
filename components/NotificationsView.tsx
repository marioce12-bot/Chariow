"use client";

import { localizeSystemMessage } from "@/lib/i18n/system-messages";
import Link from "next/link";
import { ArrowRight, Bell, BookOpen, CheckCheck, ExternalLink, MessageSquare, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { createClient } from "@/lib/supabase/browser";
import { subscribeUserNotifications, type RealtimeNotification } from "@/lib/notifications/realtime";
import { trainingGuideTitles } from "@/lib/training-guides";
import { TrainingInvitation } from "@/components/TrainingInvitation";

type NotificationItem = { id: string; type: "admin" | "autopilot" | "system"; title: string; body: string; action_url: string | null; category?: string; replies_enabled?: boolean; read_at: string | null; created_at: string };
type Filter = "all" | "unread" | "announcement" | "training" | "update";

function formatDate(value: string, locale: "fr" | "en") {
  return new Date(value).toLocaleString(locale === "fr" ? "fr-FR" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}

function normalizedCategory(value?: string) {
  return (value ?? "general").trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function NotificationsView({ onBack, userId, experienceLevel, subscription }: { onBack: () => void; userId?: string | null; experienceLevel?: string | null; subscription?: { status?: string; trial_active?: boolean } | null }) {
  const { locale, t } = useI18n();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [replyId, setReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replyMessage, setReplyMessage] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedMessage, setSelectedMessage] = useState<NotificationItem | null>(null);
  const [trainingPreviewOpen, setTrainingPreviewOpen] = useState(false);
  const showTraining = Boolean(experienceLevel && ["beginner", "some_experience"].includes(experienceLevel));
  const unread = items.filter((item) => !item.read_at).length;
  const visibleItems = items.filter((item) => filter === "all" || (filter === "unread" ? !item.read_at : normalizedCategory(item.category) === filter));
  const showTrainingInList = showTraining && (filter === "all" || filter === "training");

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
  async function openMessage(item: NotificationItem) {
    setSelectedMessage({ ...item, read_at: item.read_at ?? new Date().toISOString() });
    if (!item.read_at) await markRead(item.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function sendReply(notificationId: string) {
    if (!replyText.trim()) return;
    setReplyMessage("");
    const response = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notification_id: notificationId, body: replyText }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setReplyMessage(data.error || t("adminExtra.notifications.loadError")); return; }
    setReplyText(""); setReplyId(null); setReplyMessage(locale === "en" ? "Reply sent." : "Réponse envoyée.");
  }

  const backButton = (label: string) => <button type="button" className="mobile-back-button notifications-detail-back" onClick={() => { setSelectedMessage(null); setTrainingPreviewOpen(false); }}><ArrowRight size={15} style={{ transform: "rotate(180deg)" }} /> {label}</button>;
  if (trainingPreviewOpen) return <div className="notifications-page notifications-detail-page">
    <style>{`.mobile-nav{display:none !important}`}</style>
    {backButton(t("adminExtra.notifications.back"))}
    <div className="notifications-detail-heading"><span className="eyebrow"><BookOpen size={14} /> {locale === "en" ? "TRAINING PREVIEW" : "APERÇU DE LA FORMATION"}</span><h1>{locale === "en" ? "Training pack" : "Pack formation"}</h1></div>
    <TrainingInvitation experienceLevel={experienceLevel ?? "beginner"} subscription={subscription} />
  </div>;

  if (selectedMessage) return <div className="notifications-page notifications-detail-page">
    <style>{`.mobile-nav{display:none !important}`}</style>
    {backButton(t("adminExtra.notifications.back"))}
    <article className={`notifications-page-item notifications-message-detail ${selectedMessage.read_at ? "read" : "unread"}`}>
      <span className="eyebrow"><MessageSquare size={14} /> {locale === "en" ? "MESSAGE" : "MESSAGE"}</span>
      <h1>{selectedMessage.title}</h1>
      <span className="notifications-read-state">{normalizedCategory(selectedMessage.category)} · {selectedMessage.read_at ? t("adminExtra.notifications.read") : t("adminExtra.notifications.unread")}</span>
      <time className="notifications-item-date" dateTime={selectedMessage.created_at}>{formatDate(selectedMessage.created_at, locale)}</time>
      <p>{selectedMessage.body}</p>
      {selectedMessage.action_url ? <Link href={selectedMessage.action_url} className="notification-action" onClick={() => void markRead(selectedMessage.id)}><ExternalLink size={13} /> {t("notifications.open")}</Link> : null}
      {selectedMessage.replies_enabled ? <button type="button" className="notifications-reply-button" onClick={() => { setReplyId(replyId === selectedMessage.id ? null : selectedMessage.id); setReplyMessage(""); }}>{locale === "en" ? "Reply" : "Répondre"}</button> : null}
      {replyId === selectedMessage.id ? <form className="notifications-reply-form" onSubmit={(event) => { event.preventDefault(); void sendReply(selectedMessage.id); }}><textarea value={replyText} onChange={(event) => setReplyText(event.target.value)} maxLength={2000} placeholder={locale === "en" ? "Your reply…" : "Ta réponse…"} required /><button type="submit"><Send size={13} /> {locale === "en" ? "Send" : "Envoyer"}</button></form> : null}
      {replyMessage ? <small className="notifications-reply-status">{replyMessage}</small> : null}
    </article>
  </div>;

  return <div className="notifications-page">
    <style>{`.mobile-nav{display:none !important}`}</style>
    <div className="page-top notifications-page-head">
      <div><span className="eyebrow"><MessageSquare size={14} /> {locale === "en" ? "YOUR MESSAGES" : "TES MESSAGES"}</span><h1>Messages</h1><p>{locale === "en" ? "Find your welcome messages, training and important Vendeo updates here." : "Retrouve ici tes messages de bienvenue, formations et informations importantes de Vendeo."}</p></div>
      <button type="button" className="mobile-back-button" onClick={onBack}><ArrowRight size={15} style={{ transform: "rotate(180deg)" }} /> {t("adminExtra.notifications.back")}</button>
    </div>
    <section className="app-card notifications-card">
      <div className="messages-toolbar"><div className="messages-filters" role="group" aria-label={locale === "en" ? "Message filters" : "Filtres des messages"}>{(["all", "unread", "announcement", "training", "update"] as const).map((value) => <button type="button" key={value} className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{({ all: locale === "en" ? "All" : "Tous", unread: locale === "en" ? "Unread" : "Non lus", announcement: locale === "en" ? "Announcements" : "Annonces", training: locale === "en" ? "Training" : "Formations", update: locale === "en" ? "Updates" : "Nouveautés" }[value])}</button>)}</div>{unread ? <button type="button" className="notifications-mark-all" onClick={() => void markAllRead()}><CheckCheck size={15} /> {t("adminExtra.notifications.markAll")}</button> : null}</div>
      {showTrainingInList ? <article className="training-message-card notifications-training-card">
        <span className="training-message-icon"><BookOpen size={20} /></span>
        <div><span className="eyebrow">{locale === "en" ? "TRAINING" : "FORMATION"}</span><h2>{locale === "en" ? "Training pack" : "Pack formation"}</h2><p>{locale === "en" ? "Learn the essentials of the digital-product business with the training included in your subscription." : "Apprends les bases du business des produits digitaux grâce à la formation incluse dans ton abonnement."}</p><p className="training-poster-accessible">{locale === "en" ? `The seven ebooks in the pack are: ${trainingGuideTitles("en")}.` : `Les sept ebooks du pack sont : ${trainingGuideTitles("fr")}.`}</p></div>
        <button type="button" className="btn btn-ghost training-preview-button" onClick={() => { setTrainingPreviewOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}><BookOpen size={15} /> {locale === "en" ? "View preview" : "Voir l’aperçu"}</button>
      </article> : null}
      {loading ? <p className="hint-line">{t("adminExtra.notifications.loading")}</p> : error ? <p className="settings-inline-message settings-account-error">{localizeSystemMessage(error, locale)}</p> : (!visibleItems.length && !showTrainingInList) ? <div className="notifications-empty"><Bell size={28} /><strong>{t("adminExtra.notifications.empty")}</strong></div> : visibleItems.length ? <div className="notifications-page-list" aria-label={t("adminExtra.notifications.list")}>{visibleItems.map((item) => <article key={item.id} role="button" tabIndex={0} className={`notifications-page-item ${item.read_at ? "read" : "unread"}`} onClick={() => void openMessage(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void openMessage(item); } }}><div className="notifications-page-item-head"><strong>{item.title}</strong><span className="notifications-read-state">{normalizedCategory(item.category)} · {item.read_at ? t("adminExtra.notifications.read") : t("adminExtra.notifications.unread")}</span></div><time className="notifications-item-date" dateTime={item.created_at}>{formatDate(item.created_at, locale)}</time><p>{item.body}</p>{item.action_url ? <span className="notification-action"><ExternalLink size={13} /> {t("notifications.open")}</span> : null}</article>)}</div> : null}
    </section>
  </div>;
}
