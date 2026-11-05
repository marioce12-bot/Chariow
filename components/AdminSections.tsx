"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AdminSignupChart } from "./AdminSignupChart";
import { AdminSectionChart } from "./AdminSectionChart";
import {
  Activity,
  BarChart3,
  Building2,
  Clock,
  CreditCard,
  FileText,
  Receipt,
  Send,
  Sparkles,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import type { AdminData, UsageStats } from "@/lib/admin-dashboard-types";
import { fetchAdminJson } from "@/lib/admin-fetch";
import { AdminPeriodPicker } from "./AdminPeriodPicker";
export type { AdminData, UsageStats } from "@/lib/admin-dashboard-types";
import "./admin-user-credits.css";

export function formatDuration(totalSeconds = 0) {
  const seconds = Math.round(totalSeconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 s";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return `${minutes} min ${String(seconds % 60).padStart(2, "0")} s`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}
export function AdminTable({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div
      className="admin-table"
      style={{ "--cols": headers.length } as React.CSSProperties}
    >
      <div className="admin-row admin-row-head">
        {headers.map((header, i) => (
          <span key={`${header}-${i}`}>{header}</span>
        ))}
      </div>
      {children}
    </div>
  );
}
export function Empty({ text }: { text: string }) {
  return <div className="admin-empty">{text}</div>;
}
const dateLocale = (locale: string) => (locale === "en" ? "en-US" : "fr-FR");
const money = (n: number, locale: string) =>
  `${n.toLocaleString(dateLocale(locale))} XOF`;

export function UsageSection({
  usage,
  days,
  onDaysChange,
}: {
  usage: UsageStats | null;
  days: number;
  onDaysChange: (days: number) => void;
}) {
  const { t, locale } = useI18n();
  const rows = usage?.sections ?? [];
  const maxSeconds = Math.max(1, ...rows.map((r) => r.seconds));
  const totalSeconds = rows.reduce((n, r) => n + r.seconds, 0) || 1;
  const periods = [
    [1, "24 h"],
    [7, t("adminComplete.days7")],
    [30, t("adminComplete.days30")],
  ] as const;
  const cards = [
    [
      t("adminComplete.avgSession"),
      usage ? formatDuration(usage.avg_session_seconds) : "—",
      Clock,
    ],
    [t("adminComplete.sessions"), usage?.sessions, Activity],
    [t("adminComplete.activeUsers"), usage?.active_users, Users],
    [t("adminComplete.active24"), usage?.active_users_24h, UserPlus],
  ] as const;
  return (
    <>
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}
      >
        {periods.map(([v, label]) => (
          <button
            type="button"
            key={v}
            className={`admin-btn ${days === v ? "admin-btn-primary" : "admin-btn-soft"}`}
            onClick={() => onDaysChange(v)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="admin-kpi-grid">
        {cards.map(([label, value, Icon]) => (
          <div className="admin-kpi" key={label}>
            <Icon size={18} />
            <small>{label}</small>
            <strong>{value ?? "—"}</strong>
          </div>
        ))}
      </div>
      <section className="admin-card" style={{ marginBottom: 18 }}>
        <div className="admin-card-head">
          <h3>{t("adminComplete.recentSignups")}</h3>
          <UserPlus size={17} />
        </div>
        {usage?.signups_by_day?.length ? (
          <AdminSignupChart rows={usage.signups_by_day} locale={locale} />
        ) : (
          <Empty
            text={
              !usage
                ? locale === "en"
                  ? "Registration data unavailable."
                  : "Données d’inscription indisponibles."
                : locale === "en"
                  ? "No recent sign-ups recorded."
                  : "Aucune inscription récente enregistrée."
            }
          />
        )}
      </section>
      <section className="admin-card">
        <div className="admin-card-head">
          <div>
            <h3>{t("adminComplete.topSections")}</h3>
            <p className="admin-help">{t("adminComplete.timeBySection")}</p>
          </div>
          <BarChart3 size={17} />
        </div>
        {rows.length ? (
          <>
          <AdminSectionChart rows={rows} locale={locale} />
          <AdminTable
            headers={[
              t("adminComplete.section"),
              t("adminComplete.timeSpent"),
              t("adminComplete.share"),
              t("adminComplete.visits"),
              t("adminComplete.users"),
            ]}
          >
            {rows.map((r) => (
              <div className="admin-row" key={r.section}>
                <strong>{r.section}</strong>
                <span>
                  <span
                    style={{
                      display: "block",
                      height: 6,
                      borderRadius: 4,
                      background: "rgba(99,102,241,.18)",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        height: 6,
                        borderRadius: 4,
                        background: "#6366f1",
                        width: `${Math.max(2, (r.seconds / maxSeconds) * 100)}%`,
                      }}
                    />
                  </span>
                  {formatDuration(r.seconds)}
                </span>
                <span>{Math.round((r.seconds / totalSeconds) * 100)}%</span>
                <span>
                  {Number(r.visits).toLocaleString(dateLocale(locale))}
                </span>
                <span>
                  {Number(r.users).toLocaleString(dateLocale(locale))}
                </span>
              </div>
            ))}
          </AdminTable>
          </>
        ) : (
          <Empty
            text={
              locale === "en"
                ? "Usage data is unavailable or has not been recorded yet."
                : "Données d’usage indisponibles ou non encore enregistrées."
            }
          />
        )}
      </section>
    </>
  );
}

export function UsersSection({
  data,
  usage,
  onRefresh,
}: {
  data: AdminData;
  usage: UsageStats | null;
  onRefresh?: () => void;
}) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [grantUser, setGrantUser] = useState<string | null>(null);
  const [grantId, setGrantId] = useState("");
  const [grantCredits, setGrantCredits] = useState("500");
  const [grantReason, setGrantReason] = useState("");
  const [message, setMessage] = useState("");
  const modalId = useId();
  const modalRef = useRef<HTMLElement>(null);
  const grantTriggerRef = useRef<HTMLButtonElement | null>(null);
  const busyRef = useRef<string | null>(null);
  busyRef.current = busy;
  const [range, setRange] = useState<"all" | "24h" | "7d" | "30d">("all");
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!grantUser) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const focusFirst = () => modalRef.current?.querySelector<HTMLElement>(
      "input:not([disabled]), button:not([disabled])",
    )?.focus();
    const frame = window.requestAnimationFrame(focusFirst);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && busyRef.current === null) {
        event.preventDefault();
        setGrantUser(null);
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;
      const targets = [...modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((el) => el.getClientRects().length > 0);
      const first = targets[0], last = targets[targets.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      (grantTriggerRef.current?.isConnected ? grantTriggerRef.current : previouslyFocused)?.focus?.();
    };
  }, [grantUser]);
  const rangeMs = {
    "24h": 86400000,
    "7d": 604800000,
    "30d": 2592000000,
  } as const;
  const users = data.users.filter((u) => {
    const q = query.trim().toLowerCase();
    if (
      q &&
      !`${u.full_name ?? ""} ${u.email ?? ""} ${u.id}`.toLowerCase().includes(q)
    )
      return false;
    return (
      range === "all" ||
      Date.now() - new Date(u.created_at).getTime() <= rangeMs[range]
    );
  });
  async function activate(user: AdminData["users"][number]) {
    const who = user.email || user.full_name || user.id;
    if (
      !window.confirm(
        locale === "en"
          ? `Activate or renew Vendeo for ${who}? The subscription period restarts now and usage counters are reset. No payment is collected by this action.`
          : `Activer ou renouveler Vendeo pour ${who} ? La période redémarre maintenant et les compteurs d’usage sont réinitialisés. Cette action ne prélève aucun paiement.`,
      )
    )
      return;
    setBusy(user.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.id, plan: "starter" }),
      });
      setMessage(
        response.ok
          ? locale === "en"
            ? "Subscription activated."
            : "Abonnement activé."
          : locale === "en"
            ? "Activation failed."
            : "Activation impossible.",
      );
      if (response.ok) onRefresh?.();
    } catch {
      setMessage(
        locale === "en"
          ? "Network error. Check the current subscription before retrying."
          : "Erreur réseau. Vérifiez l’abonnement actuel avant de réessayer.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function grant(event: React.FormEvent) {
    event.preventDefault();
    if (!grantUser) return;
    const credits = Number(grantCredits);
    if (!Number.isInteger(credits) || credits < 1 || credits > 100000) {
      setMessage(
        locale === "en"
          ? "Choose 1 to 100,000 credits."
          : "Choisissez entre 1 et 100 000 crédits.",
      );
      return;
    }
    const account = data.users.find((u) => u.id === grantUser);
    const who = account?.email || account?.full_name || grantUser;
    if (
      !window.confirm(
        locale === "en"
          ? `Grant ${credits} credits to ${who}?`
          : `Attribuer ${credits} crédits à ${who} ?`,
      )
    )
      return;
    setBusy(grantUser);
    setMessage("");
    try {
      const response = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: grantUser,
          credits,
          reason: grantReason,
          grant_id: grantId,
        }),
      });
      setMessage(
        response.ok
          ? locale === "en"
            ? "Credits granted."
            : "Crédits attribués."
          : locale === "en"
            ? "Could not grant credits."
            : "Attribution impossible.",
      );
      if (response.ok) {
        setGrantUser(null);
        setGrantReason("");
        onRefresh?.();
      }
    } catch {
      setMessage(
        locale === "en"
          ? "Network error. Check the credit balance before retrying."
          : "Erreur réseau. Vérifiez le solde des crédits avant de réessayer.",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <section className="admin-card admin-users">
        <div className="admin-card-head">
          <h3>
            {locale === "en" ? "Users" : "Utilisateurs"} ({users.length})
          </h3>
          <Users size={17} />
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <input
            aria-label={
              locale === "en" ? "Search accounts" : "Rechercher des comptes"
            }
            placeholder={
              locale === "en"
                ? "Search name, email or ID"
                : "Rechercher nom, e-mail ou ID"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {(["all", "24h", "7d", "30d"] as const).map((r) => (
            <button
              type="button"
              className={`admin-btn ${range === r ? "admin-btn-primary" : "admin-btn-soft"}`}
              key={r}
              onClick={() => setRange(r)}
            >
              {r === "all" ? (locale === "en" ? "All" : "Tout") : r}
            </button>
          ))}
        </div>
        <p className="admin-help">
          {locale === "en"
            ? "Search covers the latest 500 loaded accounts. Totals below cover the platform. Available Studio credits exclude reservations for ongoing generations; — means unavailable."
            : "La recherche porte sur les 500 derniers comptes chargés. Les totaux ci-dessous concernent la plateforme. Les crédits Studio disponibles excluent les réservations des générations en cours ; — signifie indisponible."}
        </p>
        {users.length ? (
          <AdminTable
            headers={[
              locale === "en" ? "Account" : "Compte",
              t("adminComplete.date"),
              locale === "en" ? "Plan" : "Offre",
              locale === "en" ? "Studio credits available" : "Crédits Studio disponibles",
              locale === "en" ? "Actions" : "Actions",
            ]}
          >
            {users.map((u) => (
              <div className="admin-row" key={u.id}>
                <span data-label={locale === "en" ? "Account" : "Compte"}>
                  <strong>
                    {u.full_name || (locale === "en" ? "Account" : "Compte")}
                  </strong>
                  <small style={{ display: "block", color: "#8b7a99" }}>
                    {u.email || "—"}
                  </small>
                </span>
                <span data-label={t("adminComplete.date")}>
                  {new Date(u.created_at).toLocaleDateString(
                    dateLocale(locale),
                  )}
                </span>
                <span data-label={locale === "en" ? "Plan" : "Offre"}>{u.subscription?.plan ?? "—"}</span>
                <span className="admin-user-credits" data-label={locale === "en" ? "Studio credits available" : "Crédits Studio disponibles"}>{u.credit_balance == null ? "—" : u.credit_balance.toLocaleString(dateLocale(locale))}</span>
                <span className="admin-plan-actions" data-label="Actions">
                  <button
                    type="button"
                    className="admin-btn admin-btn-primary"
                    disabled={busy !== null}
                    onClick={() => void activate(u)}
                  >
                    {locale === "en" ? "Activate Vendeo" : "Activer Vendeo"}
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn-soft"
                    disabled={busy !== null}
                    onClick={(event) => {
                      grantTriggerRef.current = event.currentTarget;
                      setGrantUser(u.id);
                      setGrantId(globalThis.crypto?.randomUUID?.() ?? `${u.id}-${Date.now()}`);
                      setMessage("");
                    }}
                  >
                    {locale === "en"
                      ? "Grant credits"
                      : "Attribuer des crédits"}
                  </button>
                </span>
              </div>
            ))}
          </AdminTable>
        ) : (
          <Empty
            text={
              locale === "en"
                ? "No accounts found in the loaded sample (up to 500 accounts)."
                : "Aucun compte trouvé dans l’échantillon chargé (jusqu’à 500 comptes)."
            }
          />
        )}
      </section>
      {grantUser && typeof document !== "undefined" && createPortal(
        <div className="admin-grant-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && busy === null) setGrantUser(null);
        }}>
          <section ref={modalRef} className="admin-grant-modal" id={modalId} role="dialog" aria-modal="true" aria-labelledby={`${modalId}-title`} aria-describedby={`${modalId}-description`}>
          <h3 id={`${modalId}-title`}>{locale === "en" ? "Grant credits" : "Attribuer des crédits"}</h3>
          <p id={`${modalId}-description`}>{locale === "en" ? "Recipient: " : "Destinataire : "}<strong>{data.users.find((user) => user.id === grantUser)?.email || data.users.find((user) => user.id === grantUser)?.full_name || grantUser}</strong></p>
          {message && <p role="alert">{message}</p>}
          <form onSubmit={grant}>
            <label>
              {locale === "en" ? "Credits" : "Crédits"}
              <input aria-label={locale === "en" ? "Credits" : "Crédits"}
                type="number"
                min="1"
                max="100000"
                step="1"
                value={grantCredits}
                onChange={(e) => setGrantCredits(e.target.value)}
                required
              />
            </label>
            <label>
              {locale === "en" ? "Reason" : "Motif"}
              <input aria-label={locale === "en" ? "Reason" : "Motif"}
                maxLength={200}
                value={grantReason}
                onChange={(e) => setGrantReason(e.target.value)}
              />
            </label>
            <button
              className="admin-btn admin-btn-primary"
              type="submit"
              disabled={busy !== null}
            >
              {busy
                ? locale === "en"
                  ? "Sending…"
                  : "Envoi…"
                : locale === "en"
                  ? "Confirm"
                  : "Confirmer"}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-soft"
              disabled={busy !== null}
              onClick={() => setGrantUser(null)}
            >
              {locale === "en" ? "Cancel" : "Annuler"}
            </button>
          </form>
          </section>
        </div>, document.body,
      )}
      {message && !grantUser && (
        <p className="admin-action-message" role="status">
          {message}
        </p>
      )}
      <div className="admin-kpi-grid">
        <div className="admin-kpi">
          <small>
            {locale === "en"
              ? "All registered accounts"
              : "Total des comptes inscrits"}
          </small>
          <strong>{usage?.signups_total ?? data.metrics.users}</strong>
        </div>
        <div className="admin-kpi">
          <small>
            {locale === "en" ? "Active users" : "Utilisateurs actifs"}
          </small>
          <strong>{usage?.active_users ?? "—"}</strong>
        </div>
      </div>
    </>
  );
}

type AdminSubscriptionRow = {
  id: string; user_id: string; plan: string; status: string; classification: "paid" | "trial" | "expired";
  profile: { email?: string | null; full_name?: string | null } | null;
  current_period_start: string | null; current_period_end: string | null; trial_ends_at: string | null;
  days_left: number; last_payment_at: string | null;
};
type SubscriptionPayload = { subscriptions: AdminSubscriptionRow[]; counts: { paid: number; trial: number; expired: number }; newSubscriptionPayments: number };
export function SubscriptionsSection({ onRefresh }: { data?: AdminData; onRefresh?: () => void }) {
  const { t, locale } = useI18n();
  const en = locale === "en";
  const [periodQuery, setPeriodQuery] = useState(() => `?period=all&timeZone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`);
  const [filter, setFilter] = useState<"all" | "paid" | "trial" | "expired">("all");
  const [payload, setPayload] = useState<SubscriptionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let current = true; setLoading(true); setError(false);
    fetchAdminJson(`/api/admin/subscriptions${periodQuery}&filter=${filter}`).then(result => {
      if (!result.counts || !Array.isArray(result.subscriptions)) throw new Error();
      if (current) { setPayload(result); setLoading(false); }
    }).catch(() => { if (current) { setError(true); setLoading(false); } });
    return () => { current = false; };
  }, [periodQuery, filter, retry]);
  async function activate(subscription: AdminSubscriptionRow) {
    const name = subscription.profile?.full_name || subscription.profile?.email || subscription.user_id;
    if (!window.confirm(en ? `Activate Vendeo for ${name}? The period restarts now and usage counters are reset. No payment is collected.` : `Activer Vendeo pour ${name} ? La période redémarre maintenant et les compteurs sont réinitialisés. Aucun paiement n’est prélevé.`)) return;
    setBusy(subscription.id); setMessage("");
    try {
      const response = await fetch("/api/admin/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: subscription.user_id, plan: "starter" }) });
      setMessage(response.ok ? (en ? "Subscription activated." : "Abonnement activé.") : (en ? "Activation failed." : "Activation impossible."));
      if (response.ok) { setRetry(value => value + 1); onRefresh?.(); }
    } catch { setMessage(en ? "Network error. Check current status before retrying." : "Erreur réseau. Vérifiez l’état actuel avant de réessayer."); }
    finally { setBusy(null); }
  }
  const counts = payload?.counts;
  const tabs = [["all", en ? "All" : "Tous"], ["paid", en ? "Paid" : "Payants"], ["trial", en ? "Trials" : "Essais"], ["expired", en ? "Expired" : "Expirés"]] as const;
  const date = (value: string | null) => value ? new Date(value).toLocaleDateString(dateLocale(locale)) : "—";
  return <section className="admin-card admin-subscriptions">
    <div className="admin-card-head"><h3>{en ? "Subscriptions" : "Abonnements"}</h3><CreditCard size={17} /></div>
    <div className="admin-kpi-grid">{[
      [en ? "Current paid" : "Payants en cours", counts?.paid], [en ? "Current trials" : "Essais en cours", counts?.trial],
      [en ? "Expired" : "Expirés", counts?.expired], [en ? "New subscription payments in period" : "Nouveaux paiements sur la période", payload?.newSubscriptionPayments],
    ].map(([label, value]) => <article className="admin-kpi" key={String(label)}><small>{label}</small><strong>{value ?? "—"}</strong></article>)}</div>
    <AdminPeriodPicker onChange={setPeriodQuery} idPrefix="subscriptions-period" />
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }} role="tablist" aria-label={en ? "Subscription status" : "Statut des abonnements"}>{tabs.map(([key, label]) => <button type="button" key={key} className={`admin-btn ${filter === key ? "admin-btn-primary" : "admin-btn-soft"}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}</div>
    {loading && <p role="status">{en ? "Loading subscriptions…" : "Chargement des abonnements…"}</p>}
    {error && <p role="alert">{en ? "Subscriptions unavailable." : "Abonnements indisponibles."} <button className="admin-btn admin-btn-soft" onClick={() => setRetry(value => value + 1)}>{en ? "Retry" : "Réessayer"}</button></p>}
    {!loading && !error && (payload?.subscriptions.length ? <AdminTable headers={[en ? "Account" : "Compte", "E-mail", t("adminComplete.status"), en ? "Start" : "Début", en ? "End" : "Fin", en ? "Days left" : "Jours restants", en ? "Last payment" : "Dernier paiement", en ? "Actions" : "Actions"]}>
      {payload.subscriptions.map(item => <div className="admin-row" key={item.id}>
        <strong>{item.profile?.full_name || item.profile?.email || item.user_id}</strong><span>{item.profile?.email || "—"}</span>
        <span><span className={`admin-status ${item.classification}`}>{({ paid: en ? "Paid" : "Payant", trial: en ? "Trial" : "Essai", expired: en ? "Expired" : "Expiré" })[item.classification]}</span></span>
        <span>{date(item.current_period_start)}</span><span>{date(item.classification === "trial" ? item.trial_ends_at : item.current_period_end)}</span><span>{item.days_left}</span><span>{date(item.last_payment_at)}</span>
        <span>{item.classification !== "paid" && <button type="button" className="admin-btn admin-btn-soft" aria-label={`${en ? "Activate" : "Activer"} — ${item.profile?.email || item.user_id}`} disabled={busy === item.id} onClick={() => void activate(item)}>{en ? "Activate" : "Activer"}</button>}</span>
      </div>)}
    </AdminTable> : <Empty text={en ? "No subscriptions found." : "Aucun abonnement trouvé."} />)}
    {message && <p role="status">{message}</p>}
  </section>;
}
type TransactionRow = { id: string; kind: "subscription" | "credits"; user_id: string | null; email: string | null; full_name: string | null; amount_xof: number | null; credits: number | null; provider: string | null; status: string; is_admin_grant: boolean; created_at: string };
type TransactionPayload = { transactions: TransactionRow[]; total: number; page: number; pageSize: number; totals: { subscriptions: number; credits: number; amount_xof: number; subscription_amount_xof: number; credits_amount_xof: number; credits_sold: number } };
export function PurchasesSection({ data }: { data: AdminData }) {
  const { t, locale } = useI18n();
  const en = locale === "en";
  const [periodQuery, setPeriodQuery] = useState(() => `?period=all&timeZone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState<TransactionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true; setLoading(true); setError(false);
    fetchAdminJson(`/api/admin/transactions${periodQuery}&type=${type}&status=${status}&page=${page}`).then(result => {
      if (!Array.isArray(result.transactions) || typeof result.total !== "number") throw new Error();
      if (current) { setPayload(result); setLoading(false); }
    }).catch(() => { if (current) { setError(true); setLoading(false); } });
    return () => { current = false; };
  }, [periodQuery, type, status, page, retry]);
  const pageCount = Math.max(1, Math.ceil((payload?.total ?? 0) / 50));
  const moneyText = (n: number | null) => n == null ? "—" : money(n, locale);
  const statuses = ["all", "approved", "completed", "pending", "failed", "cancelled", "refunded"];
  return <>
    <section className="admin-card">
      <div className="admin-card-head"><h3>{en ? "Transactions" : "Transactions"}<Receipt size={17} /></h3></div>
      <AdminPeriodPicker onChange={value => { setPeriodQuery(value); setPage(1); }} idPrefix="transactions-period" />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
        <label>{en ? "Type" : "Type"}<select value={type} onChange={event => { setType(event.target.value); setPage(1); }}><option value="all">{en ? "All" : "Tout"}</option><option value="subscription">{en ? "Subscriptions" : "Abonnements"}</option><option value="credits">{en ? "Credits" : "Crédits"}</option></select></label>
        <label>{en ? "Status" : "Statut"}<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>{statuses.map(value => <option key={value} value={value}>{value === "all" ? (en ? "All" : "Tous") : value}</option>)}</select></label>
      </div>
      {payload && <p className="admin-help">{en ? `Subscriptions: ${moneyText(payload.totals.subscription_amount_xof)} · Credits: ${moneyText(payload.totals.credits_amount_xof)} · Total: ${moneyText(payload.totals.amount_xof)}` : `Abonnements : ${moneyText(payload.totals.subscription_amount_xof)} · Crédits : ${moneyText(payload.totals.credits_amount_xof)} · Total vérifié : ${moneyText(payload.totals.amount_xof)}`}</p>}
      {loading && <p role="status">{en ? "Loading transactions…" : "Chargement des transactions…"}</p>}
      {error && <p role="alert">{en ? "Transactions unavailable." : "Transactions indisponibles."} <button className="admin-btn admin-btn-soft" onClick={() => setRetry(value => value + 1)}>{en ? "Retry" : "Réessayer"}</button></p>}
      {!loading && !error && (payload?.transactions.length ? <AdminTable headers={[en ? "Account" : "Compte", "E-mail", en ? "Type" : "Type", en ? "Credits" : "Crédits", en ? "Amount" : "Montant", en ? "Provider" : "Fournisseur", t("adminComplete.status"), t("adminComplete.date")]}>
        {payload.transactions.map(row => <div className="admin-row" key={`${row.kind}-${row.id}`} style={row.is_admin_grant ? { opacity: 0.55 } : undefined}>
          <strong>{row.full_name || row.email || row.user_id || "—"}</strong><span>{row.email || "—"}</span>
          <span>{row.is_admin_grant ? (en ? "Gift" : "Cadeau") : row.kind === "subscription" ? (en ? "Subscription" : "Abonnement") : (en ? "Credit purchase" : "Achat de crédits")}</span>
          <span>{row.credits == null ? "—" : `${row.credits.toLocaleString(dateLocale(locale))} ${t("studio.credits")}`}</span><span>{row.is_admin_grant ? (en ? "Gift" : "Cadeau") : moneyText(row.amount_xof)}</span>
          <span>{row.provider || "—"}</span><span><span className={`admin-status ${row.status}`}>{row.status}</span></span><span>{new Date(row.created_at).toLocaleString(dateLocale(locale))}</span>
        </div>)}
      </AdminTable> : <Empty text={en ? "No transactions found." : "Aucune transaction trouvée."} />)}
      {payload && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 14 }}><span>{en ? `Page ${page} of ${pageCount} · ${payload.total} transactions` : `Page ${page} sur ${pageCount} · ${payload.total} transactions`}</span><div><button type="button" className="admin-btn admin-btn-soft" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>{en ? "Previous" : "Précédent"}</button> <button type="button" className="admin-btn admin-btn-soft" disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>{en ? "Next" : "Suivant"}</button></div></div>}
    </section>
    <section className="admin-card">
      <div className="admin-card-head"><h3>{locale === "en" ? "Credit usage" : "Utilisation des crédits"}</h3><Sparkles size={17} /></div>
      {data.creditTransactions.length ? <AdminTable headers={[locale === "en" ? "Account" : "Compte", locale === "en" ? "Operation" : "Opération", locale === "en" ? "Model" : "Modèle", locale === "en" ? "Credits" : "Crédits", t("adminComplete.date")]}>
        {data.creditTransactions.map(x => <div className="admin-row" key={x.id}><strong>{data.users.find(user => user.id === (x as any).user_id)?.full_name || data.users.find(user => user.id === (x as any).user_id)?.email || "—"}</strong><span>{x.operation || "Studio"}</span><span>{x.model || "—"}</span><span>-{x.credits}</span><span>{new Date(x.created_at).toLocaleString(dateLocale(locale))}</span></div>)}
      </AdminTable> : <Empty text={locale === "en" ? "No credit usage found." : "Aucune utilisation de crédits."} />}
    </section>
  </>;
}
export function PayoutsSection({
  data,
  onRefresh,
}: {
  data: AdminData;
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();
  const [form, setForm] = useState({
    amount_xof: "",
    recipient_name: "",
    recipient_phone: "",
    recipient_method: "mtn_bj",
    recipient_country: "BJ",
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const summary =
      locale === "en"
        ? `Send ${money(Number(form.amount_xof), locale)} to ${form.recipient_name} (${form.recipient_phone}) via ${form.recipient_method}?`
        : `Envoyer ${money(Number(form.amount_xof), locale)} à ${form.recipient_name} (${form.recipient_phone}) via ${form.recipient_method} ?`;
    if (!window.confirm(summary)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json().catch(() => ({}));
      setMessage(
        response.ok
          ? locale === "en"
            ? "Payout submitted."
            : "Décaissement envoyé."
          : locale === "en"
            ? "Payout failed. Check the history before retrying."
            : "Échec du décaissement. Vérifiez l’historique avant de réessayer.",
      );
      if (response.ok) {
        setForm({
          amount_xof: "",
          recipient_name: "",
          recipient_phone: "",
          recipient_method: "mtn_bj",
          recipient_country: "BJ",
        });
        onRefresh();
      }
    } catch {
      setMessage(
        locale === "en"
          ? "Result unknown after a network error. Check payout history before retrying."
          : "Résultat inconnu après erreur réseau. Vérifiez l’historique avant de réessayer.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="admin-card">
        <div className="admin-card-head">
          <h3>{locale === "en" ? "Create payout" : "Créer un décaissement"}</h3>
          <Send size={17} />
        </div>
        <p className="admin-help">
          {locale === "en"
            ? "Existing SasPay payout integration. Submitting sends real funds; check the amount, recipient and method carefully."
            : "Intégration de décaissement SasPay existante. L’envoi transfère des fonds réels : vérifiez montant, bénéficiaire et méthode."}
        </p>
        <form className="admin-payout-form" onSubmit={submit}>
          <label>
            {locale === "en" ? "Amount (XOF)" : "Montant (XOF)"}
            <input
              type="number"
              min="1000"
              step="1"
              required
              value={form.amount_xof}
              onChange={(e) => setForm({ ...form, amount_xof: e.target.value })}
            />
          </label>
          <label>
            {locale === "en" ? "Recipient name" : "Nom du destinataire"}
            <input
              required
              value={form.recipient_name}
              onChange={(e) =>
                setForm({ ...form, recipient_name: e.target.value })
              }
            />
          </label>
          <label>
            {locale === "en" ? "Recipient phone" : "Téléphone du destinataire"}
            <input
              required
              value={form.recipient_phone}
              onChange={(e) =>
                setForm({ ...form, recipient_phone: e.target.value })
              }
            />
          </label>
          <label>
            {locale === "en" ? "Payment method" : "Mode de paiement"}
            <input
              required
              value={form.recipient_method}
              onChange={(e) =>
                setForm({ ...form, recipient_method: e.target.value })
              }
            />
          </label>
          <button
            type="submit"
            className="admin-btn admin-btn-primary"
            disabled={busy}
          >
            {busy
              ? locale === "en"
                ? "Sending…"
                : "Envoi…"
              : locale === "en"
                ? "Submit payout"
                : "Envoyer le décaissement"}
          </button>
        </form>
        {message && <p role="status">{message}</p>}
      </section>
      <section className="admin-card">
        <div className="admin-card-head">
          <h3>
            {locale === "en"
              ? "Payout history"
              : "Historique des décaissements"}
          </h3>
          <Wallet size={17} />
        </div>
        {data.payouts?.length ? (
          <AdminTable
            headers={[
              locale === "en" ? "Reference" : "Référence",
              locale === "en" ? "Amount" : "Montant",
              locale === "en" ? "Method" : "Mode",
              t("adminComplete.status"),
              t("adminComplete.date"),
            ]}
          >
            {data.payouts.map((p) => (
              <div className="admin-row" key={p.id}>
                <strong>{p.id.slice(0, 8)}</strong>
                <span>{money(p.amount_xof, locale)}</span>
                <span>{p.recipient_method}</span>
                <span className={`admin-status ${p.status}`}>{p.status}</span>
                <span>
                  {new Date(p.created_at).toLocaleString(dateLocale(locale))}
                </span>
              </div>
            ))}
          </AdminTable>
        ) : (
          <Empty
            text={
              locale === "en"
                ? "No payouts found."
                : "Aucun décaissement trouvé."
            }
          />
        )}
      </section>
    </>
  );
}

export function IntegrationsSection({ data }: { data: AdminData }) {
  const { t, locale } = useI18n();
  const users = new Map(
    data.users.map((u) => [u.id, u.full_name || u.email || u.id]),
  );
  return (
    <>
      <p className="admin-help">
        {locale === "en"
          ? "Latest 100 records per source. Only account and connection metadata is displayed; no store content."
          : "100 dernières lignes par source. Seules les métadonnées de compte et de connexion sont affichées, sans contenu boutique."}
      </p>
      <section className="admin-card">
        <div className="admin-card-head">
          <h3>
            {locale === "en" ? "Store connections" : "Connexions boutique"}
          </h3>
          <Building2 size={17} />
        </div>
        {data.stores.length ? (
          <AdminTable
            headers={[
              locale === "en" ? "Account" : "Compte",
              locale === "en" ? "Platform" : "Plateforme",
              locale === "en" ? "Connection date" : "Date de connexion",
              t("adminComplete.status"),
            ]}
          >
            {data.stores.map((s) => (
              <div className="admin-row" key={s.id}>
                <strong>{users.get(s.user_id) || s.user_id}</strong>
                <span>{s.platform}</span>
                <span>
                  {s.connected_at
                    ? new Date(s.connected_at).toLocaleString(
                        dateLocale(locale),
                      )
                    : "—"}
                </span>
                <span className={`admin-status ${s.connection_status}`}>
                  {s.is_active === false
                    ? locale === "en"
                      ? "Inactive"
                      : "Inactive"
                    : ["active", "connected"].includes(s.connection_status)
                      ? locale === "en"
                        ? "Connected"
                        : "Connectée"
                      : locale === "en"
                        ? "Review required"
                        : "À vérifier"}{" "}
                  · {s.connection_status || "—"}
                </span>
              </div>
            ))}
          </AdminTable>
        ) : (
          <Empty
            text={
              locale === "en" ? "No stores found." : "Aucune boutique trouvée."
            }
          />
        )}
      </section>
      <section className="admin-card">
        <div className="admin-card-head">
          <h3>{locale === "en" ? "Meta accounts" : "Comptes Meta"}</h3>
          <Building2 size={17} />
        </div>
        {data.metaAccounts.length ? (
          <AdminTable
            headers={[
              locale === "en" ? "Account" : "Compte",
              locale === "en" ? "Last sync" : "Dernière synchronisation",
              t("adminComplete.status"),
            ]}
          >
            {data.metaAccounts.map((a) => (
              <div className="admin-row" key={a.id}>
                <strong>{users.get(a.user_id) || a.user_id}</strong>
                <span>
                  {a.last_synced_at
                    ? new Date(a.last_synced_at).toLocaleString(
                        dateLocale(locale),
                      )
                    : "—"}
                </span>
                <span
                  className={`admin-status ${a.is_active ? "active" : "inactive"}`}
                >
                  {a.is_active
                    ? locale === "en"
                      ? "Connected"
                      : "Connecté"
                    : locale === "en"
                      ? "Disconnected"
                      : "Déconnecté"}
                </span>
              </div>
            ))}
          </AdminTable>
        ) : (
          <Empty
            text={
              locale === "en"
                ? "No Meta accounts found."
                : "Aucun compte Meta trouvé."
            }
          />
        )}
      </section>
    </>
  );
}
export function AuditSection({ data }: { data: AdminData }) {
  const { t, locale } = useI18n();
  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <h3>{t("adminComplete.sensitiveAudit")}</h3>
        <FileText size={17} />
      </div>
      {data.audit.length ? (
        <AdminTable
          headers={[
            t("adminComplete.action"),
            t("adminComplete.resource"),
            t("adminComplete.date"),
          ]}
        >
          {data.audit.map((item) => (
            <div className="admin-row" key={item.id}>
              <strong>{item.action}</strong>
              <span>{item.resource_type}</span>
              <span>
                {new Date(item.created_at).toLocaleString(dateLocale(locale))}
              </span>
            </div>
          ))}
        </AdminTable>
      ) : (
        <Empty
          text={
            locale === "en"
              ? "No audit events found."
              : "Aucun événement d’audit trouvé."
          }
        />
      )}
    </section>
  );
}
