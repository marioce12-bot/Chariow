"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { localizeSystemMessage } from "@/lib/i18n/system-messages";
import {
  Activity,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileText,
  Globe2,
  Loader2,
  LogOut,
  Plug,
  RefreshCw,
  Search,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  AdminNavigation,
  adminLabel,
  adminSectionKeys,
} from "./AdminNavigation";
import { AdminNotifications } from "./AdminNotifications";
import { AdminFeedbackSection } from "./FeedbackView";
import {
  UsersSection,
  UsageSection,
  SubscriptionsSection,
  PurchasesSection,
  PayoutsSection,
  IntegrationsSection,
  AuditSection,
} from "./AdminSections";
import type { AdminData, UsageStats } from "@/lib/admin-dashboard-types";
import "./admin-dashboard.css";

export function AdminDashboard() {
  const { locale, setLocale } = useI18n();
  const en = locale === "en";
  const [active, setActive] = useState("overview");
  const [data, setData] = useState<AdminData | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [usageDays, setUsageDays] = useState(7);
  const [usageError, setUsageError] = useState("");
  const [usageLoading, setUsageLoading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const usageRequest = useRef(0);
  const overviewRequest = useRef(0);
  const titleRef = useRef<HTMLHeadingElement>(null);

  async function loadUsage(days: number) {
    const request = ++usageRequest.current;
    setUsageLoading(true);
    setUsageError("");
    try {
      const response = await fetch(`/api/admin/usage?days=${days}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.usage) throw new Error("usage_unavailable");
      if (request === usageRequest.current) setUsage(payload.usage);
    } catch {
      if (request === usageRequest.current) {
        setUsage(null);
        setUsageError("usage_unavailable");
      }
    } finally {
      if (request === usageRequest.current) setUsageLoading(false);
    }
  }
  async function load() {
    const request = ++overviewRequest.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/overview", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          response.status === 401 || response.status === 403
            ? "access_denied"
            : "overview_unavailable",
        );
      if (!payload.metrics || !Array.isArray(payload.users))
        throw new Error("overview_unavailable");
      if (request === overviewRequest.current) {
        setData(payload);
        setUpdated(new Date());
      }
    } catch (cause) {
      if (request === overviewRequest.current)
        setError(
          cause instanceof Error ? cause.message : "overview_unavailable",
        );
    } finally {
      if (request === overviewRequest.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      overviewRequest.current++;
    };
  }, []);
  useEffect(() => {
    void loadUsage(usageDays);
    return () => {
      usageRequest.current++;
    };
  }, [usageDays]);
  useEffect(() => {
    const sync = () => {
      const key = window.location.hash.slice(1);
      if (adminSectionKeys.some((item) => item === key)) setActive(key);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  function navigate(section: string) {
    setActive(section);
    window.history.replaceState(null, "", `#${section}`);
    titleRef.current?.focus();
  }
  async function signOut() {
    setLogoutBusy(true);
    try {
      const response = await fetch("/api/admin/password-logout", {
        method: "POST",
      });
      if (!response.ok) throw new Error();
      window.location.assign("/admin/login");
    } catch {
      setError("logout_failed");
      setLogoutBusy(false);
    }
  }
  const errorText =
    error === "access_denied"
      ? en
        ? "Your admin session is unavailable. Sign in again."
        : "Votre session administrateur est indisponible. Reconnectez-vous."
      : error === "logout_failed"
        ? en
          ? "Sign-out failed. Please retry."
          : "La déconnexion a échoué. Veuillez réessayer."
        : en
          ? "The console could not be refreshed. No unavailable value is shown as zero."
          : "La console n’a pas pu être actualisée. Aucune donnée indisponible n’est remplacée par un zéro.";

  return (
    <main className="admin-shell owner-console">
      <AdminNavigation active={active} onChange={navigate} />
      <header className="admin-header owner-header">
        <div className="owner-breadcrumb">
          <ShieldCheck size={16} />
          <span>{en ? "Administration" : "Administration"}</span>
          <ChevronRight size={14} />
          <strong>{adminLabel(active, locale)}</strong>
        </div>
        <div className="admin-header-actions">
          <button
            type="button"
            className="owner-search-shortcut"
            onClick={() => navigate("users")}
          >
            <Search size={16} />
            <span>{en ? "Find an account" : "Trouver un compte"}</span>
          </button>
          <button
            type="button"
            className="admin-language"
            aria-label={en ? "Passer en français" : "Switch to English"}
            onClick={() => setLocale(en ? "fr" : "en")}
          >
            <Globe2 size={16} />
            {locale.toUpperCase()}
          </button>
          <span className="owner-header-divider" />
          <span className="owner-header-person">
            <span className="owner-avatar">M</span>
            <span>
              {en ? "Owner" : "Propriétaire"}
              <small>Super-admin</small>
            </span>
          </span>
          <button
            type="button"
            className="admin-logout"
            aria-label={en ? "Sign out" : "Déconnexion"}
            title={en ? "Sign out" : "Déconnexion"}
            disabled={logoutBusy}
            onClick={() => void signOut()}
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <section className="admin-content owner-content">
        <div className="admin-toolbar owner-toolbar">
          <div>
            <span className="admin-kicker">
              {en
                ? "YOUR OBSERVATION & CONTROL CENTER"
                : "VOTRE CENTRE D’OBSERVATION ET DE CONTRÔLE"}
            </span>
            <h1 ref={titleRef} tabIndex={-1}>
              {adminLabel(active, locale)}
            </h1>
            <p>
              {active === "overview"
                ? en
                  ? "One place to understand, monitor and act on Vendeo."
                  : "Un seul espace pour comprendre, surveiller et piloter Vendeo."
                : en
                  ? "All the controls you need, in your owner workspace."
                  : "Tous les contrôles utiles, dans votre espace propriétaire."}
            </p>
          </div>
          <div className="owner-refresh-group">
            {updated && (
              <span>
                {en ? "Updated at " : "Actualisé à "}
                {updated.toLocaleTimeString(en ? "en-US" : "fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            <button
              type="button"
              className="admin-refresh"
              disabled={loading}
              onClick={() => {
                void load();
                void loadUsage(usageDays);
              }}
            >
              <RefreshCw
                size={15}
                className={loading ? "owner-spinning" : ""}
              />
              {en ? "Refresh" : "Actualiser"}
            </button>
          </div>
        </div>
        {error && (
          <div className="owner-notice owner-notice-error" role="alert">
            <TriangleAlert size={18} />
            <span>
              {errorText}
              {data && (
                <strong>
                  {" "}
                  {en
                    ? "Last loaded data is retained."
                    : "Les dernières données chargées restent affichées."}
                </strong>
              )}
            </span>
            {error === "access_denied" ? (
              <a href="/admin/login">{en ? "Sign in" : "Se connecter"}</a>
            ) : (
              <button type="button" onClick={() => void load()}>
                {en ? "Retry" : "Réessayer"}
              </button>
            )}
          </div>
        )}
        {usageError && ["overview", "usage", "users"].includes(active) && (
          <div className="owner-notice" role="alert">
            <TriangleAlert size={18} />
            <span>
              {en
                ? "Usage statistics are unavailable. Other account data remains accessible."
                : "Les statistiques d’usage sont indisponibles. Les autres données de compte restent accessibles."}
            </span>
            <button type="button" onClick={() => void loadUsage(usageDays)}>
              {en ? "Retry" : "Réessayer"}
            </button>
          </div>
        )}
        {!data ? (
          <div className="owner-empty-state" role="status">
            {loading ? (
              <>
                <Loader2 className="owner-spinning" size={28} />
                <h2>
                  {en
                    ? "Loading your control center"
                    : "Chargement de votre centre de contrôle"}
                </h2>
              </>
            ) : (
              <>
                <ShieldCheck size={30} />
                <h2>{en ? "Console unavailable" : "Console indisponible"}</h2>
                <p>
                  {en
                    ? "Retry or sign in with your owner session."
                    : "Réessayez ou reconnectez votre session propriétaire."}
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            {active === "overview" && (
              <Overview
                data={data}
                usage={usage}
                days={usageDays}
                usageLoading={usageLoading}
                navigate={navigate}
              />
            )}
            {active === "users" && (
              <UsersSection
                data={data}
                usage={usage}
                onRefresh={() => void load()}
              />
            )}
            {active === "usage" && (
              <>
                {usageLoading && (
                  <p role="status">
                    {en
                      ? "Loading statistics…"
                      : "Chargement des statistiques…"}
                  </p>
                )}
                <UsageSection
                  usage={usage}
                  days={usageDays}
                  onDaysChange={setUsageDays}
                />
              </>
            )}
            {active === "integrations" && <IntegrationsSection data={data} />}
            {active === "notifications" && (
              <AdminNotifications totalUsers={data.metrics.users} />
            )}
            {active === "feedback" && <AdminFeedbackSection />}
            {active === "subscriptions" && (
              <SubscriptionsSection data={data} onRefresh={() => void load()} />
            )}
            {active === "purchases" && <PurchasesSection data={data} />}
            {active === "payouts" && (
              <PayoutsSection data={data} onRefresh={() => void load()} />
            )}
            {active === "audit" && <AuditSection data={data} />}
          </>
        )}
        <footer className="owner-content-footer">
          <ShieldCheck size={14} />
          <span>
            {en
              ? "Private owner view · Account metrics only · No store content or credentials"
              : "Vue privée propriétaire · Métriques de compte uniquement · Aucun contenu boutique ni identifiant secret"}
          </span>
        </footer>
      </section>
    </main>
  );
}

function Overview({
  data,
  usage,
  days,
  usageLoading,
  navigate,
}: {
  data: AdminData;
  usage: UsageStats | null;
  days: number;
  usageLoading: boolean;
  navigate: (section: string) => void;
}) {
  const { locale } = useI18n();
  const en = locale === "en";
  const fmt = (value: number | undefined) =>
    value === undefined
      ? "—"
      : Number(value).toLocaleString(en ? "en-US" : "fr-FR");
  const connectionCount = data.metrics.stores + data.metrics.metaAccounts;
  const flaggedStores = data.stores.filter(
    (store) =>
      store.is_active === false ||
      !["connected", "active"].includes(store.connection_status),
  );
  const inactiveMeta = data.metaAccounts.filter(
    (account) => account.is_active === false,
  );
  const unsyncedMeta = data.metaAccounts.filter(
    (account) => account.is_active !== false && !account.last_synced_at,
  );
  const warnings =
    flaggedStores.length + inactiveMeta.length + unsyncedMeta.length;
  const sampleCount = data.stores.length + data.metaAccounts.length;
  const cards = [
    {
      label: en ? "Registered accounts" : "Comptes inscrits",
      value: fmt(data.metrics.users),
      note: en ? "All platform accounts" : "Tous les comptes de la plateforme",
      icon: Users,
      color: "violet",
    },
    {
      label: en ? "Active users" : "Utilisateurs actifs",
      value: fmt(usage?.active_users),
      note: en
        ? `Over the last ${days} days`
        : `Sur les ${days} derniers jours`,
      icon: Activity,
      color: "green",
    },
    {
      label: en ? "Connected accounts" : "Comptes reliés",
      value: fmt(connectionCount),
      note: en
        ? "Stores + Meta · all statuses"
        : "Boutiques + Meta · tous états",
      icon: Plug,
      color: "blue",
    },
    {
      label: en ? "Active subscriptions" : "Abonnements actifs",
      value: fmt(data.business.active_subscriptions),
      note: en
        ? "Platform subscription metrics"
        : "Indicateur global des abonnements",
      icon: CreditCard,
      color: "amber",
    },
  ];
  const signupDays = usage?.signups_by_day ?? [];
  const max = Math.max(1, ...signupDays.map((day) => day.count));
  const signupSum = signupDays.reduce((sum, day) => sum + day.count, 0);
  const date = (value: string) =>
    new Date(value).toLocaleDateString(en ? "en-US" : "fr-FR", {
      day: "numeric",
      month: "short",
    });
  return (
    <>
      <div className="owner-overview-strip">
        <span>
          <span className="owner-status-dot" />
          {en ? "Account data loaded" : "Données de compte chargées"}
        </span>
        <small>
          {en
            ? "Not a real-time infrastructure health check"
            : "Ne constitue pas un contrôle d’infrastructure en temps réel"}
        </small>
      </div>
      <div className="admin-kpi-grid owner-kpis">
        {cards.map(({ label, value, note, icon: Icon, color }) => (
          <article className="admin-kpi" key={label}>
            <div className="owner-kpi-top">
              <span>{label}</span>
              <span className={`owner-kpi-icon ${color}`}>
                <Icon size={19} />
              </span>
            </div>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <div className="owner-main-grid">
        <section className="admin-card owner-growth">
          <div className="admin-card-head">
            <div>
              <h2>{en ? "Account growth" : "Évolution des inscriptions"}</h2>
              <p>
                {en
                  ? "New registrations, day by day"
                  : "Les nouveaux comptes, jour après jour"}
              </p>
            </div>
            <span className="owner-period">
              {en ? `${days} days` : `${days} jours`}
            </span>
          </div>
          {signupDays.length ? (
            <>
              <div className="owner-chart-summary">
                <strong>{fmt(signupSum)}</strong>
                <span>
                  {en
                    ? "registrations in the returned period"
                    : "inscriptions sur la période retournée"}
                </span>
              </div>
              <div
                className="owner-bar-chart"
                role="img"
                aria-label={signupDays
                  .map((day) => `${date(day.day)} : ${day.count}`)
                  .join(", ")}
              >
                {signupDays.map((day, i) => (
                  <div className="owner-bar-column" key={day.day}>
                    <strong>{day.count}</strong>
                    <div className="owner-bar-track">
                      <span
                        className={i === signupDays.length - 1 ? "latest" : ""}
                        style={{ height: `${(day.count / max) * 100}%` }}
                      />
                    </div>
                    <small>{date(day.day)}</small>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="owner-panel-empty">
              {usageLoading
                ? en
                  ? "Loading registrations…"
                  : "Chargement des inscriptions…"
                : usage
                  ? en
                    ? "No registration recorded in this period."
                    : "Aucune inscription enregistrée sur cette période."
                  : en
                    ? "Registration statistics unavailable."
                    : "Statistiques d’inscription indisponibles."}
            </div>
          )}
          <button
            type="button"
            className="owner-text-link"
            onClick={() => navigate("usage")}
          >
            {en ? "Explore usage" : "Explorer l’usage"}
            <ArrowRight size={15} />
          </button>
        </section>
        <section className="admin-card owner-watch">
          <div className="admin-card-head">
            <div>
              <h2>{en ? "Watchlist" : "Points de vigilance"}</h2>
              <p>
                {en
                  ? "Connection sample only"
                  : "Échantillon de connexions uniquement"}
              </p>
            </div>
            <TriangleAlert size={19} />
          </div>
          <div
            className={`owner-watch-summary ${warnings ? "needs-attention" : ""}`}
          >
            <span>
              {warnings ? (
                <TriangleAlert size={19} />
              ) : (
                <CheckCircle2 size={19} />
              )}
            </span>
            <div>
              <strong>
                {sampleCount
                  ? warnings
                    ? en
                      ? `${warnings} items to review`
                      : `${warnings} point${warnings > 1 ? "s" : ""} à vérifier`
                    : en
                      ? "No issue in the sample"
                      : "Aucune anomalie dans l’échantillon"
                  : en
                    ? "No connection in the sample"
                    : "Aucune connexion dans l’échantillon"}
              </strong>
              <small>
                {en
                  ? `${sampleCount} records inspected, up to 100 per source`
                  : `${sampleCount} lignes examinées, 100 maximum par source`}
              </small>
            </div>
          </div>
          <div className="owner-watch-row">
            <span>
              {en ? "Stores to review" : "Connexions boutique à vérifier"}
            </span>
            <strong>{flaggedStores.length}</strong>
          </div>
          <div className="owner-watch-row">
            <span>
              {en ? "Inactive Meta accounts" : "Comptes Meta inactifs"}
            </span>
            <strong>{inactiveMeta.length}</strong>
          </div>
          <div className="owner-watch-row">
            <span>
              {en
                ? "Meta sync never recorded"
                : "Synchro Meta jamais enregistrée"}
            </span>
            <strong>{unsyncedMeta.length}</strong>
          </div>
          <button
            type="button"
            className="owner-text-link"
            onClick={() => navigate("integrations")}
          >
            {en ? "Review connections" : "Examiner les connexions"}
            <ArrowRight size={15} />
          </button>
        </section>
      </div>
      <section
        className="owner-quick-actions"
        aria-label={en ? "Quick actions" : "Actions rapides"}
      >
        <span>{en ? "Take action" : "Passer à l’action"}</span>
        <button type="button" onClick={() => navigate("users")}>
          <Users size={16} />
          {en ? "Manage accounts" : "Gérer les comptes"}
          <ArrowRight size={14} />
        </button>
        <button type="button" onClick={() => navigate("notifications")}>
          <Bell size={16} />
          {en ? "Send a notification" : "Envoyer une notification"}
          <ArrowRight size={14} />
        </button>
        <button type="button" onClick={() => navigate("feedback")}>
          <FileText size={16} />
          {en ? "Read feedback" : "Lire les retours"}
          <ArrowRight size={14} />
        </button>
      </section>
      <div className="owner-bottom-grid">
        <section className="admin-card">
          <div className="admin-card-head">
            <div>
              <h2>{en ? "Latest accounts" : "Derniers comptes"}</h2>
              <p>
                {en
                  ? "The latest registrations on Vendeo"
                  : "Les inscriptions les plus récentes sur Vendeo"}
              </p>
            </div>
            <button
              type="button"
              className="owner-text-link"
              onClick={() => navigate("users")}
            >
              {en ? "View all" : "Tout voir"}
              <ArrowRight size={14} />
            </button>
          </div>
          {data.users.length ? (
            <div className="owner-account-list">
              {data.users.slice(0, 4).map((user) => (
                <div key={user.id} className="owner-account-row">
                  <span className="owner-account-avatar">
                    {(user.full_name || user.email || "?")
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <span>
                    <strong>
                      {user.full_name ||
                        (en ? "Unnamed account" : "Compte sans nom")}
                    </strong>
                    <small>{user.email || "—"}</small>
                  </span>
                  <time dateTime={user.created_at}>
                    {date(user.created_at)}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <p className="owner-panel-empty">
              {en ? "No account yet." : "Aucun compte pour le moment."}
            </p>
          )}
        </section>
        <section className="admin-card">
          <div className="admin-card-head">
            <div>
              <h2>{en ? "Control history" : "Historique de contrôle"}</h2>
              <p>
                {en
                  ? "The most recent recorded actions"
                  : "Les dernières actions enregistrées"}
              </p>
            </div>
            <button
              type="button"
              className="owner-text-link"
              onClick={() => navigate("audit")}
            >
              {en ? "Audit log" : "Journal"}
              <ArrowRight size={14} />
            </button>
          </div>
          {data.audit.length ? (
            <div className="owner-audit-list">
              {data.audit.slice(0, 4).map((item) => (
                <div className="owner-audit-row" key={item.id}>
                  <span className="owner-audit-dot" />
                  <div>
                    <strong>
                      {localizeSystemMessage(item.action, locale)}
                    </strong>
                    <small>
                      {item.resource_type} ·{" "}
                      {new Date(item.created_at).toLocaleString(
                        en ? "en-US" : "fr-FR",
                        {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="owner-panel-empty">
              {en
                ? "No recorded action yet."
                : "Aucune action enregistrée pour le moment."}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
