"use client";

import { localizeSystemMessage } from "@/lib/i18n/system-messages";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { Bell, FileText, Search, Trash2, X } from "lucide-react";
import "./admin-notifications.css";

import { fetchAdminJson, adminReadError } from "@/lib/admin-fetch";

type User = { id: string; full_name: string | null; email: string | null };
type Item = { id: string; title: string; body: string; created_at: string; metadata?: { broadcast_id?: string }; profiles?: { email?: string | null; full_name?: string | null } | null };

export function AdminNotifications({ totalUsers, refreshRevision = 0 }: { totalUsers: number; refreshRevision?: number }) {
  const { t , locale } = useI18n();
  const [audience, setAudience] = useState("all");
  const [selected, setSelected] = useState<User[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchRevision, setSearchRevision] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [history, setHistory] = useState<Item[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const historyRequest = useRef(0);
  useEffect(() => () => { historyRequest.current++; }, []);

  useEffect(() => {
    if (audience !== "selected") return;
    const controller = new AbortController();
    setSearching(true); setSearchError("");
    const timer = window.setTimeout(async () => {
      try {
        const result = await fetchAdminJson(`/api/admin/users?q=${encodeURIComponent(query)}&page=${page}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!Array.isArray(result.users)) throw new Error("admin_read_invalid");
        setUsers(result.users ?? []); setHasMore(result.hasMore); setTotal(result.total);
      } catch (error) {
        if (!controller.signal.aborted) { setUsers([]); setSearchError(adminReadError(error, locale)); }
      } finally { if (!controller.signal.aborted) setSearching(false); }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [audience, query, page, locale, searchRevision]);

  async function loadHistory() {
    const request = ++historyRequest.current;
    setHistoryLoading(true); setHistoryError("");
    try {
      const result = await fetchAdminJson("/api/admin/notifications");
      if (!Array.isArray(result.notifications)) throw new Error("admin_read_invalid");
      if (request === historyRequest.current) setHistory(result.notifications);
    } catch (error) { if (request === historyRequest.current) setHistoryError(adminReadError(error, locale)); }
    finally { if (request === historyRequest.current) setHistoryLoading(false); }
  }
  useEffect(() => { void loadHistory(); }, [locale, refreshRevision]);

  function toggle(user: User) {
    setSelected((current) => current.some((item) => item.id === user.id) ? current.filter((item) => item.id !== user.id) : [...current, user]);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const count = audience === "all" ? totalUsers : selected.length;
    if (!count || !window.confirm(t("dynamicExtra.confirmSend", { title: (title.trim()), count: (count) }))) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, message: body, action_url: actionUrl, audience, user_ids: selected.map((user) => user.id) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("adminComplete.sendImpossible"));
      const push = result.push;
      const pushSummary = push?.error ? push.error : push ? t("dynamicExtra.pushSummary", { accepted: (push.accepted), failed: (push.failed), expired: (push.expired), unsubscribed: (push.unsubscribedUsers) }) : t("adminComplete.pushUnavailable");
      setMessage(t("dynamicExtra.messagesSent", { count: (result.sent), summary: (pushSummary) })); setTitle(""); setBody(""); setActionUrl(""); setSelected([]);
      await loadHistory();
    } catch (error) { setMessage(error instanceof Error ? error.message : t("adminComplete.retryVerify")); }
    finally { setBusy(false); }
  }
  async function remove(item: Item, allRecipients = false) {
    const target = allRecipients ? t("adminComplete.deleteAllTarget") : t("dynamicExtra.forRecipient", { name: (item.profiles?.email || item.profiles?.full_name || "ce destinataire") });
    if (!window.confirm(t("dynamicExtra.confirmDeleteNotification", { title: (item.title), target: (target) }))) return;
    setDeleting(item.id); setMessage("");
    try {
      const response = await fetch("/api/admin/notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, all_recipients: allRecipients }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("adminComplete.deleteImpossible"));
      setMessage(t("dynamicExtra.notificationsDeleted", { count: (result.deleted) }));
      await loadHistory();
    } catch (error) { setMessage(error instanceof Error ? error.message : t("adminComplete.deleteImpossible")); }
    finally { setDeleting(null); }
  }
  return <>
    {message && <p className="admin-action-message" role="status">{message}</p>}
    <div className="admin-columns admin-notifications-columns">
      <section className="admin-card">
        <div className="admin-card-head"><div><h3>{t("adminComplete.notificationSend")}</h3><p className="admin-help">{t("adminComplete.noEmail")}</p></div><Bell size={17} /></div>
        <form className="admin-notification-form" onSubmit={submit}>
          <label>{t("adminComplete.title")}<input maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
          <label>{t("adminComplete.internalLink")}<input maxLength={300} placeholder="/dashboard" value={actionUrl} onChange={(event) => setActionUrl(event.target.value)} pattern="^(/[^/].*|/)?$" /></label>
          <label>Message<textarea maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} required /></label>
          <label>{t("adminComplete.recipients")}<select value={audience} onChange={(event) => setAudience(event.target.value)}><option value="all">{t("sweep3.text98")}{totalUsers})</option><option value="selected">{t("adminComplete.chooseUsers")}</option></select></label>
          {audience === "selected" && <fieldset className="admin-recipient-picker"><legend>{t("sweep1.text99")}{" "}{selected.length}</legend>
            <div className="admin-recipient-chips">{selected.map((user) => <button type="button" key={user.id} onClick={() => toggle(user)} aria-label={`${locale === "en" ? "Remove" : "Retirer"} ${user.email || user.full_name || user.id}`}>{user.email || user.full_name || user.id}<X size={13} /></button>)}</div>
            {!!selected.length && <button type="button" className="admin-btn admin-btn-soft" onClick={() => setSelected([])}>{t("adminComplete.clearSelection")}</button>}
            <label className="admin-recipient-search"><Search size={16} /><input type="search" placeholder={t("adminComplete.searchUsers")} aria-label={t("adminComplete.searchUsersLabel")} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
            <div className="admin-recipient-results" aria-busy={searching}>
              {searching ? <p role="status">{t("adminComplete.searching")}</p> : searchError ? <div role="alert"><p>{localizeSystemMessage(searchError, locale)}</p><button type="button" className="admin-btn admin-btn-soft" onClick={() => setSearchRevision((value) => value + 1)}>{t("adminExtra.admin.retry")}</button></div> : users.length ? users.map((user) => <label className="admin-recipient-option" key={user.id}><input type="checkbox" checked={selected.some((item) => item.id === user.id)} onChange={() => toggle(user)} /><span><strong>{user.full_name || (locale === "en" ? "Unnamed" : "Sans nom")}</strong><small>{user.email || user.id}</small></span></label>) : <p>{t("adminComplete.noUsers")}</p>}
            </div>
            <div className="admin-recipient-pagination"><button type="button" className="admin-btn admin-btn-soft" disabled={page === 0 || searching} onClick={() => setPage(page - 1)}>{t("adminComplete.previous")}</button><small>{total} {" "}{t("sweep2.text100")}{" "}{page + 1}</small><button type="button" className="admin-btn admin-btn-soft" disabled={!hasMore || searching} onClick={() => setPage(page + 1)}>{t("adminComplete.next")}</button></div>
          </fieldset>}
          <button className="admin-btn admin-btn-primary" disabled={busy || !title.trim() || !body.trim() || (audience === "selected" ? !selected.length : !totalUsers)}>{busy ? t("adminExtra.push.sending") : t("dynamicExtra.sendTo", { count: (audience === "selected" ? selected.length : totalUsers) })}</button>
        </form>
      </section>
      <section className="admin-card"><div className="admin-card-head"><div><h3>{t("adminComplete.recentAdminMessages")}</h3><p className="admin-help">{t("adminComplete.historyDesc")}</p></div><FileText size={17} /></div>
        {historyError ? <div role="alert"><p>{localizeSystemMessage(historyError, locale)}</p><button type="button" className="admin-btn admin-btn-soft" onClick={() => void loadHistory()}>{t("adminExtra.admin.retry")}</button></div> : historyLoading ? <p role="status">{t("adminComplete.historyLoading")}</p> : <div className="admin-notification-history">{history.length ? history.map((item) => <article className="admin-notification-history-item" key={item.id}><strong>{item.title}</strong><p>{item.body}</p><small>{item.profiles?.full_name || item.profiles?.email || t("adminComplete.user")} · {new Date(item.created_at).toLocaleString(locale === "en" ? "en-US" : "fr-FR")}</small><div className="admin-notification-delete"><button type="button" disabled={deleting !== null} onClick={() => void remove(item)}><Trash2 size={14} />{deleting === item.id ? t("adminExtra.push.deleting") : t("adminExtra.push.delete")}</button>{item.metadata?.broadcast_id && <button type="button" disabled={deleting !== null} onClick={() => void remove(item, true)}>{t("adminComplete.removeAll")}</button>}</div></article>) : <div className="admin-empty">{t("adminComplete.noMessages")}</div>}</div>}
      </section>
    </div>
  </>;
}
