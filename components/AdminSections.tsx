"use client";
import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
export type { AdminData, UsageStats } from "@/lib/admin-dashboard-types";

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
          <div className="admin-signup-chart">
            {usage.signups_by_day.map((d) => (
              <div key={d.day} title={`${d.day}: ${d.count}`}>
                <strong>{d.count}</strong>
                <span
                  style={{
                    height: `${(d.count / Math.max(1, ...usage.signups_by_day.map((x) => x.count))) * 90}px`,
                  }}
                />
                <small>
                  {new Date(d.day).toLocaleDateString(dateLocale(locale), {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </small>
              </div>
            ))}
          </div>
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
      <section className="admin-card">
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
            ? "Search covers the latest 500 loaded accounts. Totals below cover the platform."
            : "La recherche porte sur les 500 derniers comptes chargés. Les totaux ci-dessous concernent la plateforme."}
        </p>
        {users.length ? (
          <AdminTable
            headers={[
              locale === "en" ? "Account" : "Compte",
              t("adminComplete.date"),
              locale === "en" ? "Plan" : "Offre",
              locale === "en" ? "Actions" : "Actions",
            ]}
          >
            {users.map((u) => (
              <div className="admin-row" key={u.id}>
                <span>
                  <strong>
                    {u.full_name || (locale === "en" ? "Account" : "Compte")}
                  </strong>
                  <small style={{ display: "block", color: "#8b7a99" }}>
                    {u.email || "—"}
                  </small>
                </span>
                <span>
                  {new Date(u.created_at).toLocaleDateString(
                    dateLocale(locale),
                  )}
                </span>
                <span>{u.subscription?.plan ?? "—"}</span>
                <span className="admin-plan-actions">
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

export function SubscriptionsSection({
  data,
  onRefresh,
}: {
  data: AdminData;
  onRefresh?: () => void;
}) {
  const { t, locale } = useI18n();
  const names = new Map(
    data.users.map((u) => [
      u.id,
      u.full_name || u.email || t("adminComplete.noName"),
    ]),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function activate(s: AdminData["subscriptions"][number]) {
    if (
      !window.confirm(
        locale === "en"
          ? `Activate Vendeo for ${names.get(s.user_id) ?? s.user_id}? The period restarts now and usage counters are reset. No payment is collected.`
          : `Activer Vendeo pour ${names.get(s.user_id) ?? s.user_id} ? La période redémarre maintenant et les compteurs sont réinitialisés. Aucun paiement n’est prélevé.`,
      )
    )
      return;
    setBusy(s.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: s.user_id, plan: "starter" }),
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
          ? "Network error. Check current status before retrying."
          : "Erreur réseau. Vérifiez l’état actuel avant de réessayer.",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="admin-card">
      <div className="admin-card-head">
        <h3>{locale === "en" ? "Subscriptions" : "Abonnements"}</h3>
        <CreditCard size={17} />
      </div>
      {data.subscriptions.length ? (
        <AdminTable
          headers={[
            locale === "en" ? "Account" : "Compte",
            locale === "en" ? "Plan" : "Offre",
            t("adminComplete.status"),
            locale === "en" ? "Period ends" : "Fin de période",
            locale === "en" ? "Actions" : "Actions",
          ]}
        >
          {data.subscriptions.map((s) => (
            <div className="admin-row" key={s.id}>
              <strong>
                {names.get(s.user_id) || t("adminComplete.noName")}
              </strong>
              <span>{s.plan}</span>
              <span className={`admin-status ${s.status}`}>{s.status}</span>
              <span>
                {s.current_period_end
                  ? new Date(s.current_period_end).toLocaleDateString(
                      dateLocale(locale),
                    )
                  : "—"}
              </span>
              <span>
                {s.status !== "active" && (
                  <button
                    type="button"
                    className="admin-btn admin-btn-soft"
                    disabled={busy === s.id}
                    onClick={() => void activate(s)}
                  >
                    {locale === "en" ? "Activate" : "Activer"}
                  </button>
                )}
              </span>
            </div>
          ))}
        </AdminTable>
      ) : (
        <Empty
          text={
            locale === "en"
              ? "No subscriptions found."
              : "Aucun abonnement trouvé."
          }
        />
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}

export function PurchasesSection({ data }: { data: AdminData }) {
  const { t, locale } = useI18n();
  const names = new Map(
    data.users.map((u) => [u.id, u.full_name || u.email || u.id]),
  );
  return (
    <>
      <section className="admin-card">
        <div className="admin-card-head">
          <h3>{t("adminComplete.studioTopups")}</h3>
          <Wallet size={17} />
        </div>
        <p className="admin-help">
          {locale === "en"
            ? `Credit revenue: ${data.business.credit_revenue_xof == null ? "—" : money(data.business.credit_revenue_xof, locale)} · Credits sold: ${data.business.credits_sold ?? "—"}`
            : `Revenus des crédits : ${data.business.credit_revenue_xof == null ? "—" : money(data.business.credit_revenue_xof, locale)} · Crédits vendus : ${data.business.credits_sold ?? "—"}`}
        </p>
        {data.creditPurchases.length ? (
          <AdminTable
            headers={[
              locale === "en" ? "Account" : "Compte",
              locale === "en" ? "Credits" : "Crédits",
              locale === "en" ? "Amount" : "Montant",
              t("adminComplete.date"),
            ]}
          >
            {data.creditPurchases.map((p) => (
              <div className="admin-row" key={p.id}>
                <strong>{names.get(p.user_id)}</strong>
                <span>
                  {p.credits.toLocaleString(dateLocale(locale))}{" "}
                  {t("studio.credits")}
                </span>
                <span>
                  {p.operation === "admin_grant" ||
                  p.metadata?.provider === "admin_grant"
                    ? locale === "en"
                      ? "Admin grant"
                      : "Attribution admin"
                    : p.metadata?.amount_xof == null
                      ? "—"
                      : money(p.metadata.amount_xof, locale)}
                </span>
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
                ? "No credit purchases found."
                : "Aucun achat de crédits trouvé."
            }
          />
        )}
      </section>
      <section className="admin-card">
        <div className="admin-card-head">
          <h3>
            {locale === "en" ? "Credit usage" : "Utilisation des crédits"}
          </h3>
          <Sparkles size={17} />
        </div>
        {data.creditTransactions.length ? (
          <AdminTable
            headers={[
              locale === "en" ? "Account" : "Compte",
              locale === "en" ? "Operation" : "Opération",
              locale === "en" ? "Model" : "Modèle",
              locale === "en" ? "Credits" : "Crédits",
              t("adminComplete.date"),
            ]}
          >
            {data.creditTransactions.map((x) => (
              <div className="admin-row" key={x.id}>
                <strong>{names.get(x.user_id)}</strong>
                <span>{x.operation || "Studio"}</span>
                <span>{x.model || "—"}</span>
                <span>-{x.credits}</span>
                <span>
                  {new Date(x.created_at).toLocaleString(dateLocale(locale))}
                </span>
              </div>
            ))}
          </AdminTable>
        ) : (
          <Empty
            text={
              locale === "en"
                ? "No credit usage found."
                : "Aucune utilisation de crédits trouvée."
            }
          />
        )}
      </section>
    </>
  );
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
