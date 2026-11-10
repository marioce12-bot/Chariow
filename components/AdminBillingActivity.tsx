"use client";

import { useEffect, useMemo, useState } from "react";
import { CreditCard, History, Loader2, RefreshCw, Search, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import "./admin-billing-activity.css";

type HistoryEvent = {
  id: string;
  type: "credit_purchase" | "admin_credit_gift" | "subscription_payment" | "subscription_admin_activation";
  created_at: string;
  status: string;
  plan?: string;
  credits?: number;
  amount_xof?: number;
  provider_amount?: number;
  provider_currency?: string;
  provider?: string;
  reference?: string;
  note?: string;
  author?: { id: string; name: string | null; email: string | null } | null;
};

type ActiveSubscription = {
  user_id: string;
  plan: string;
  status: string;
  trial_active: boolean;
  trial_ends_at: string | null;
  current_period_end: string | null;
  user: { id: string; email: string | null; full_name: string | null };
};

function dateLocale(locale: string) {
  return locale === "en" ? "en-US" : "fr-FR";
}

function typeLabel(type: HistoryEvent["type"], en: boolean) {
  const labels: Record<HistoryEvent["type"], string> = en
    ? {
        credit_purchase: "Credit purchase",
        admin_credit_gift: "Admin credit grant",
        subscription_payment: "Subscription payment",
        subscription_admin_activation: "Subscription activated by admin",
      }
    : {
        credit_purchase: "Achat de crédits",
        admin_credit_gift: "Cadeau de crédits admin",
        subscription_payment: "Paiement d’abonnement",
        subscription_admin_activation: "Abonnement activé par admin",
      };
  return labels[type];
}

function statusLabel(status: string, en: boolean) {
  const labels: Record<string, string> = en
    ? { approved: "Paid", completed: "Completed", refunded: "Refunded", pending: "Pending", failed: "Failed", active: "Activated" }
    : { approved: "Payé", completed: "Terminé", refunded: "Remboursé", pending: "En attente", failed: "Échec", active: "Activé" };
  return labels[status] ?? status;
}

export function AdminUserHistory({
  userId,
  userName,
  onClose,
}: {
  userId: string;
  userName: string;
  onClose?: () => void;
}) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"access" | "load" | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetch(`/api/admin/users/${encodeURIComponent(userId)}/history?page=${page}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "access" : "load");
        return payload as { events?: HistoryEvent[]; hasMore?: boolean; truncated?: boolean };
      })
      .then((payload) => {
        const next = Array.isArray(payload.events) ? payload.events : [];
        setEvents((previous) => page === 0 ? next : [...previous, ...next]);
        setHasMore(Boolean(payload.hasMore));
        setTruncated(Boolean(payload.truncated));
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error && cause.message === "access" ? "access" : "load");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [userId, page]);

  return (
    <section className="admin-card admin-user-history" aria-label={en ? "Account payment and credit history" : "Historique des paiements et crédits du compte"}>
      <div className="admin-card-head">
        <div>
          <h3><History size={17} /> {en ? "Account history" : "Historique du compte"}</h3>
          <p className="admin-help">{userName} · {en ? "Newest first" : "Plus récent en premier"}</p>
        </div>
        {onClose && <button type="button" className="admin-btn admin-btn-soft admin-history-close" onClick={onClose} aria-label={en ? "Close history" : "Fermer l’historique"}><X size={16} /></button>}
      </div>
      {error ? <p className="admin-history-error" role="alert">{error === "access"
        ? (en ? "Your admin session cannot read this history." : "Votre session admin ne permet pas de lire cet historique.")
        : (en ? "History could not be loaded." : "Impossible de charger l’historique.")}</p> : null}
      {loading && page === 0 ? <p className="admin-history-loading" role="status"><Loader2 className="admin-history-spin" size={17} /> {en ? "Loading history…" : "Chargement de l’historique…"}</p> : null}
      {!loading && !error && events.length === 0 ? <p className="admin-help">{en ? "No payment or credit entries were recorded for this account." : "Aucune écriture de paiement ou de crédit n’est enregistrée pour ce compte."}</p> : null}
      {events.length > 0 && (
        <div className="admin-history-list">
          {events.map((event) => {
            const adminAction = event.type === "admin_credit_gift" || event.type === "subscription_admin_activation";
            const author = event.author?.name || event.author?.email;
            const providerAmount = event.provider_amount != null && event.provider_currency
              ? `${event.provider_amount.toLocaleString(dateLocale(locale))} ${event.provider_currency}`
              : null;
            return (
              <article className="admin-history-event" key={event.id}>
                <div className="admin-history-event-top">
                  <strong>{typeLabel(event.type, en)}</strong>
                  <span className={`admin-status ${event.status}`}>{statusLabel(event.status, en)}</span>
                </div>
                <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString(dateLocale(locale))}</time>
                <div className="admin-history-facts">
                  {event.plan && <span>{en ? "Plan" : "Offre"} : {event.plan}</span>}
                  {event.credits != null && <span>{event.credits.toLocaleString(dateLocale(locale))} {en ? "credits" : "crédits"}</span>}
                  {event.amount_xof != null && <span>{event.amount_xof.toLocaleString(dateLocale(locale))} XOF</span>}
                  {providerAmount && event.provider_currency !== "XOF" && <span>{en ? "Provider amount" : "Montant prestataire"} : {providerAmount}</span>}
                  {event.provider && <span>{en ? "Provider" : "Prestataire"} : {event.provider}</span>}
                </div>
                {event.reference && <p className="admin-history-reference">{en ? "Reference" : "Référence"} : <code>{event.reference}</code></p>}
                {event.note && <p className="admin-history-note">{en ? "Reason" : "Motif"} : {event.note}</p>}
                {adminAction && <p className="admin-history-author">{en ? "Admin" : "Admin"} : {author || (en ? "Not recorded in the available logs" : "Non journalisé dans les données disponibles")}</p>}
              </article>
            );
          })}
        </div>
      )}
      {loading && page > 0 ? <p className="admin-history-loading" role="status"><Loader2 className="admin-history-spin" size={16} /> {en ? "Loading more…" : "Chargement…"}</p> : null}
      {hasMore && <button type="button" className="admin-btn admin-btn-soft admin-history-more" disabled={loading} onClick={() => setPage((value) => value + 1)}>{en ? "Load more" : "Voir la suite"}</button>}
      {truncated && <p className="admin-history-limit" role="note">{en ? "Only the latest 1,000 entries are available through this view." : "Seules les 1 000 écritures les plus récentes sont accessibles dans cette vue."}</p>}
    </section>
  );
}

export function ActiveSubscriptionsCard() {
  const { locale } = useI18n();
  const en = locale === "en";
  const [subscriptions, setSubscriptions] = useState<ActiveSubscription[]>([]);
  const [selected, setSelected] = useState<ActiveSubscription | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void fetch("/api/admin/subscriptions", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload.subscriptions)) throw new Error("load");
        return payload.subscriptions as ActiveSubscription[];
      })
      .then(setSubscriptions)
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return subscriptions;
    return subscriptions.filter((item) => `${item.user.full_name ?? ""} ${item.user.email ?? ""} ${item.user_id}`.toLowerCase().includes(needle));
  }, [subscriptions, query]);

  return (
    <>
      <section className="admin-card admin-active-subscriptions">
        <div className="admin-card-head">
          <div>
            <h3><CreditCard size={17} /> {en ? "Accounts with access in progress" : "Comptes avec accès en cours"} ({loading ? "…" : subscriptions.length})</h3>
            <p className="admin-help">{en ? "Paid subscriptions within their period and unexpired free trials, using the same access rule as the app." : "Abonnements payés non expirés et essais gratuits encore valables, selon la règle d’accès de l’application."}</p>
          </div>
          <button type="button" className="admin-btn admin-btn-soft" onClick={() => setRevision((value) => value + 1)} disabled={loading} aria-label={en ? "Refresh active subscriptions" : "Actualiser les abonnements en cours"}><RefreshCw size={15} /></button>
        </div>
        <label className="admin-active-search">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={en ? "Search name, email or ID" : "Rechercher nom, e-mail ou ID"} aria-label={en ? "Search active accounts" : "Rechercher les comptes actifs"} />
        </label>
        {loading && <p className="admin-history-loading" role="status"><Loader2 className="admin-history-spin" size={16} /> {en ? "Loading active accounts…" : "Chargement des comptes en cours…"}</p>}
        {error && <div className="admin-history-error" role="alert">{en ? "Active subscriptions could not be loaded." : "Impossible de charger les abonnements en cours."} <button type="button" onClick={() => setRevision((value) => value + 1)}>{en ? "Retry" : "Réessayer"}</button></div>}
        {!loading && !error && filtered.length === 0 && <p className="admin-help">{en ? "No active subscription or valid trial found." : "Aucun abonnement en cours ou essai valide trouvé."}</p>}
        {filtered.length > 0 && (
          <div className="admin-active-list">
            {filtered.map((item) => {
              const name = item.user.full_name || item.user.email || item.user_id;
              const end = item.trial_active ? item.trial_ends_at : item.current_period_end;
              return (
                <div className="admin-active-row" key={item.user_id}>
                  <div className="admin-active-identity">
                    <strong>{name}</strong>
                    {item.user.email && item.user.full_name && <small>{item.user.email}</small>}
                  </div>
                  <span className="admin-active-plan">{item.plan}</span>
                  <span className={`admin-status ${item.trial_active ? "trialing" : "active"}`}>{item.trial_active ? (en ? "Trial" : "Essai") : (en ? "Paid" : "Payé")}</span>
                  <small className="admin-active-end">{item.trial_active ? (en ? "Trial ends " : "Fin de l’essai ") : (en ? "Period ends " : "Fin de période ")}{end ? new Date(end).toLocaleDateString(dateLocale(locale)) : "—"}</small>
                  <button type="button" className="admin-btn admin-btn-soft" onClick={() => setSelected(item)}>{en ? "History" : "Historique"}</button>
                </div>
              );
            })}
          </div>
        )}
      </section>
      {selected && <AdminUserHistory key={selected.user_id} userId={selected.user_id} userName={selected.user.full_name || selected.user.email || selected.user_id} onClose={() => setSelected(null)} />}
    </>
  );
}
