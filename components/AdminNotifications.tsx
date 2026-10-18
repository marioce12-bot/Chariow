"use client";

import { useEffect, useState } from "react";
import { Bell, FileText, Search, Trash2, X } from "lucide-react";
import "./admin-notifications.css";

type User = { id: string; full_name: string | null; email: string | null };
type Item = { id: string; title: string; body: string; created_at: string; metadata?: { broadcast_id?: string }; profiles?: { email?: string | null; full_name?: string | null } | null };

export function AdminNotifications({ totalUsers }: { totalUsers: number }) {
  const [audience, setAudience] = useState("all");
  const [selected, setSelected] = useState<User[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [history, setHistory] = useState<Item[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (audience !== "selected") return;
    const controller = new AbortController();
    setSearching(true); setSearchError("");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}&page=${page}`, { signal: controller.signal, cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Recherche impossible.");
        setUsers(result.users ?? []); setHasMore(result.hasMore); setTotal(result.total);
      } catch (error) {
        if (!controller.signal.aborted) { setUsers([]); setSearchError(error instanceof Error ? error.message : "Recherche impossible."); }
      } finally { if (!controller.signal.aborted) setSearching(false); }
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [audience, query, page]);

  async function loadHistory() {
    setHistoryLoading(true); setHistoryError("");
    try {
      const response = await fetch("/api/admin/notifications", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Historique indisponible.");
      setHistory(result.notifications ?? []);
    } catch (error) { setHistoryError(error instanceof Error ? error.message : "Historique indisponible."); }
    finally { setHistoryLoading(false); }
  }
  useEffect(() => { void loadHistory(); }, []);

  function toggle(user: User) {
    setSelected((current) => current.some((item) => item.id === user.id) ? current.filter((item) => item.id !== user.id) : [...current, user]);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const count = audience === "all" ? totalUsers : selected.length;
    if (!count || !window.confirm(`Envoyer « ${title.trim()} » à ${count} utilisateur(s) dans Vendeo et par notification système sur leurs appareils abonnés ?`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, message: body, action_url: actionUrl, audience, user_ids: selected.map((user) => user.id) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Envoi impossible.");
      const push = result.push;
      const pushSummary = push?.error ? push.error : push ? `${push.accepted} push accepté(s) par le service du navigateur, ${push.failed} échec(s), ${push.expired} abonnement(s) expiré(s). ${push.unsubscribedUsers} utilisateur(s) sans appareil abonné. Un push accepté ne garantit pas son affichage ou sa sonnerie sur le téléphone.` : "Résultat push indisponible.";
      setMessage(`${result.sent} message(s) enregistré(s) dans Vendeo. ${pushSummary}`); setTitle(""); setBody(""); setActionUrl(""); setSelected([]);
      await loadHistory();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Envoi impossible. Ne réessaie pas sans vérifier l’historique."); }
    finally { setBusy(false); }
  }
  async function remove(item: Item, allRecipients = false) {
    const target = allRecipients ? "chez tous les destinataires de cet envoi" : `pour ${item.profiles?.email || item.profiles?.full_name || "ce destinataire"}`;
    if (!window.confirm(`Supprimer définitivement « ${item.title} » ${target} ? Un message déjà lu ne peut pas être effacé de la mémoire du destinataire.`)) return;
    setDeleting(item.id); setMessage("");
    try {
      const response = await fetch("/api/admin/notifications", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, all_recipients: allRecipients }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Suppression impossible.");
      setMessage(`${result.deleted} notification(s) supprimée(s).`);
      await loadHistory();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Suppression impossible."); }
    finally { setDeleting(null); }
  }
  return <>
    {message && <p className="admin-action-message" role="status">{message}</p>}
    <div className="admin-columns admin-notifications-columns">
      <section className="admin-card">
        <div className="admin-card-head"><div><h3>Envoyer une notification</h3><p className="admin-help">Message dans l’app, sans envoi d’email.</p></div><Bell size={17} /></div>
        <form className="admin-notification-form" onSubmit={submit}>
          <label>Titre<input maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} required /></label>
          <label>Lien interne (facultatif)<input maxLength={300} placeholder="/dashboard" value={actionUrl} onChange={(event) => setActionUrl(event.target.value)} pattern="^(/[^/].*|/)?$" /></label>
          <label>Message<textarea maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} required /></label>
          <label>Destinataires<select value={audience} onChange={(event) => setAudience(event.target.value)}><option value="all">Tous les utilisateurs ({totalUsers})</option><option value="selected">Choisir des utilisateurs</option></select></label>
          {audience === "selected" && <fieldset className="admin-recipient-picker"><legend>Utilisateurs sélectionnés : {selected.length}</legend>
            <div className="admin-recipient-chips">{selected.map((user) => <button type="button" key={user.id} onClick={() => toggle(user)} aria-label={`Retirer ${user.email || user.full_name || user.id}`}>{user.email || user.full_name || user.id}<X size={13} /></button>)}</div>
            {!!selected.length && <button type="button" className="admin-btn admin-btn-soft" onClick={() => setSelected([])}>Vider la sélection</button>}
            <label className="admin-recipient-search"><Search size={16} /><input type="search" placeholder="Rechercher par nom ou email" aria-label="Rechercher des utilisateurs" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /></label>
            <div className="admin-recipient-results" aria-busy={searching}>
              {searching ? <p role="status">Recherche…</p> : searchError ? <p role="alert">{searchError}</p> : users.length ? users.map((user) => <label className="admin-recipient-option" key={user.id}><input type="checkbox" checked={selected.some((item) => item.id === user.id)} onChange={() => toggle(user)} /><span><strong>{user.full_name || "Sans nom"}</strong><small>{user.email || user.id}</small></span></label>) : <p>Aucun utilisateur trouvé.</p>}
            </div>
            <div className="admin-recipient-pagination"><button type="button" className="admin-btn admin-btn-soft" disabled={page === 0 || searching} onClick={() => setPage(page - 1)}>Précédent</button><small>{total} résultat(s) · page {page + 1}</small><button type="button" className="admin-btn admin-btn-soft" disabled={!hasMore || searching} onClick={() => setPage(page + 1)}>Suivant</button></div>
          </fieldset>}
          <button className="btn btn-dark" disabled={busy || !title.trim() || !body.trim() || (audience === "selected" ? !selected.length : !totalUsers)}>{busy ? "Envoi…" : `Envoyer à ${audience === "selected" ? selected.length : totalUsers} utilisateur(s)`}</button>
        </form>
      </section>
      <section className="admin-card"><div className="admin-card-head"><div><h3>Messages administrateur récents</h3><p className="admin-help">100 dernières notifications par destinataire. Les nouveaux envois peuvent aussi être retirés pour tout le groupe.</p></div><FileText size={17} /></div>
        {historyError ? <div role="alert"><p>{historyError}</p><button type="button" className="admin-btn admin-btn-soft" onClick={() => void loadHistory()}>Réessayer</button></div> : historyLoading ? <p role="status">Chargement de l’historique…</p> : <div className="admin-notification-history">{history.length ? history.map((item) => <article className="admin-notification-history-item" key={item.id}><strong>{item.title}</strong><p>{item.body}</p><small>{item.profiles?.full_name || item.profiles?.email || "Utilisateur"} · {new Date(item.created_at).toLocaleString("fr-FR")}</small><div className="admin-notification-delete"><button type="button" disabled={deleting !== null} onClick={() => void remove(item)}><Trash2 size={14} />{deleting === item.id ? "Suppression…" : "Supprimer pour ce destinataire"}</button>{item.metadata?.broadcast_id && <button type="button" disabled={deleting !== null} onClick={() => void remove(item, true)}>Retirer cet envoi pour tous</button>}</div></article>) : <div className="admin-empty">Aucun message envoyé.</div>}</div>}
      </section>
    </div>
  </>;
}
