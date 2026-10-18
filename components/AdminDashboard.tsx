"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, BarChart3, Bell, Building2, Clock, CreditCard, FileText, LogOut, RefreshCw, ShieldCheck, Users, UserPlus, Wallet, Receipt, Sparkles, Send, Gift, BadgeCheck, MessageSquareText } from "lucide-react";
import { AdminHeaderNavigation, AdminNavigation } from "./AdminNavigation";
import { AdminNotifications } from "./AdminNotifications";
import { AdminFeedbackSection } from "./FeedbackView";
import { createClient } from "@/lib/supabase/browser";

type AdminData = {
  admin: { role: string };
  metrics: { users: number; stores: number; subscriptions: number; messages: number; metaAccounts: number };
  business: { total_revenue_xof?: number; credit_revenue_xof?: number; subscription_revenue_xof?: number; credit_purchases?: number; credits_sold?: number; active_subscriptions?: number; registered_users?: number; studio_generations?: number };
  users: Array<{ id: string; email: string | null; full_name: string | null; created_at: string; subscription?: { plan: string; status: string } | null }>;
  stores: Array<{ id: string; store_name: string; platform: string; connection_status: string; user_id: string }>;
  subscriptions: Array<{ id: string; user_id: string; plan: string; status: string; messages_used_this_month: number; messages_limit: number; current_period_end?: string }>;
  metaAccounts: Array<{ id: string; name: string | null; meta_account_id: string; last_synced_at: string | null }>;
  audit: Array<{ id: string; action: string; resource_type: string; resource_id?: string | null; created_at: string }>;
  creditPurchases: Array<{ id: string; user_id: string; credits: number; status: string; operation?: string; metadata?: { amount_xof?: number; provider?: string }; created_at: string }>;
  creditTransactions: Array<{ id: string; user_id: string; credits: number; operation?: string; model?: string; status: string; created_at: string }>;
  paymentEvents: Array<{ id: string; user_id: string; plan?: string; status: string; created_at: string }>;
  payouts?: Array<{ id: string; amount_xof: number; recipient_name: string; recipient_phone: string; recipient_method: string; status: string; created_at: string }>;
};

type UsageStats = {
  signups_24h: number;
  signups_7d: number;
  signups_30d: number;
  signups_total: number;
  active_users_24h: number;
  days: number;
  sessions: number;
  active_users: number;
  avg_session_seconds: number;
  sections: Array<{ section: string; seconds: number; visits: number; users: number }>;
  signups_by_day: Array<{ day: string; count: number }>;
};

const sections = [["overview", "Vue générale", Activity], ["users", "Inscriptions", UserPlus], ["usage", "Usage de l’app", BarChart3], ["notifications", "Notifications", Bell], ["subscriptions", "Abonnements", CreditCard], ["purchases", "Achats & recharges", Receipt], ["payouts", "Décaissement", Send], ["integrations", "Intégrations", Building2], ["audit", "Journal d’audit", FileText], ["feedback", "Retours & notes", MessageSquareText]] as const;

function formatDuration(totalSeconds = 0) {
  const seconds = Math.round(totalSeconds);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${String(seconds % 60).padStart(2, "0")} s`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

export function AdminDashboard() {
  const [active, setActive] = useState("overview");
  const headerRef = useRef<HTMLElement>(null);
  const [data, setData] = useState<AdminData | null>(null);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [usageDays, setUsageDays] = useState(7);
  const usageRequest = useRef(0);
  const [usageError, setUsageError] = useState("");
  const [usageLoading, setUsageLoading] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadUsage(days: number) {
    const requestId = ++usageRequest.current;
    setUsageLoading(true); setUsageError("");
    try {
      const response = await fetch(`/api/admin/usage?days=${days}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (requestId !== usageRequest.current) return;
      if (!response.ok || !payload.usage) throw new Error(payload.error || "Statistiques indisponibles.");
      setUsage(payload.usage);
    } catch (error) {
      if (requestId !== usageRequest.current) return;
      setUsage(null);
      setUsageError(error instanceof Error ? error.message : "Statistiques indisponibles.");
    } finally { if (requestId === usageRequest.current) setUsageLoading(false); }
  }

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/overview");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error ?? "Accès administrateur refusé.");
    else setData(payload);
    setLoading(false);
    if (response.ok) void loadUsage(usageDays);
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { void loadUsage(usageDays); }, [usageDays]);

  // Keep the fixed sidebar below the header, including wrapped desktop layouts.
  const hasData = Boolean(data);
  useEffect(() => {
    const header = headerRef.current;
    const shell = header?.closest<HTMLElement>(".admin-shell");
    if (!header || !shell) return;
    const update = () => shell.style.setProperty("--admin-header-height", `${header.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, [hasData, error]);

  async function signOut() {
    await fetch("/api/admin/password-logout", { method: "POST" });
    await createClient().auth.signOut();
    window.location.href = "/admin/login";
  }

  if (loading && !data) return <main className="admin-shell"><div className="admin-loading">Chargement de la console administrateur…</div></main>;
  if (error || !data) return <main className="admin-shell"><div className="admin-error"><ShieldCheck size={25} /><h1>Console indisponible</h1><p>{error || "Impossible de charger la console administrateur."}</p>{error?.includes("Authentification") ? <a className="admin-link" href="/admin/login">Se connecter</a> : null}</div></main>;

  return <main className="admin-shell">
    <header ref={headerRef} className="admin-header"><div className="admin-header-title"><span className="admin-kicker">Vendeo interne</span><h1>Console administrateur</h1></div><AdminHeaderNavigation active={active} onChange={setActive} /><div className="admin-header-actions"><span className="admin-role">{data.admin.role}</span><button type="button" onClick={signOut} className="admin-logout"><LogOut size={15} /> Déconnexion</button></div></header>
    <div className="admin-layout">
      <AdminNavigation active={active} onChange={setActive} />
      <section className="admin-content">
        <div className="admin-toolbar"><div><span className="admin-kicker">Pilotage plateforme</span><h2>{sections.find(([key]) => key === active)?.[1]}</h2></div><button type="button" className="admin-refresh" onClick={() => void load()}><RefreshCw size={15} /> {loading ? "Actualisation…" : "Actualiser"}</button></div>
        {usageError && ["overview", "usage", "users"].includes(active) && <p className="admin-action-message" role="alert">{usageError} <button type="button" className="admin-btn admin-btn-soft" onClick={() => void loadUsage(usageDays)}>Réessayer</button></p>}
        {usageLoading && active === "usage" && <p role="status">Chargement des statistiques…</p>}
        {active === "overview" && <Overview data={data} usage={usage} />}
        {active === "users" && <UsersSection data={data} usage={usage} />}
        {active === "usage" && <UsageSection usage={usage} days={usageDays} onDaysChange={setUsageDays} />}
        {active === "notifications" && <AdminNotifications totalUsers={data.metrics.users} />}
        {active === "subscriptions" && <SubscriptionsSection data={data} />}
        {active === "purchases" && <PurchasesSection data={data} />}
        {active === "payouts" && <PayoutsSection data={data} onRefresh={() => void load()} />}
        {active === "integrations" && <IntegrationsSection data={data} />}
        {active === "audit" && <AuditSection data={data} />}
        {active === "feedback" && <AdminFeedbackSection />}
      </section>
    </div>
  </main>;
}

function Overview({ data, usage }: { data: AdminData; usage: UsageStats | null }) {
  const money = (value = 0) => `${Number(value).toLocaleString("fr-FR")} XOF`;
  const signups24h = usage?.signups_24h ?? data.users.filter((user) => Date.now() - new Date(user.created_at).getTime() <= 24 * 3600 * 1000).length;
  const topSection = usage?.sections?.[0]?.section ?? "—";
  const cards = [["Chiffre d'affaires", money(data.business.total_revenue_xof), Wallet], ["Recharges Studio", money(data.business.credit_revenue_xof), Receipt], ["Abonnements encaissés", money(data.business.subscription_revenue_xof), CreditCard], ["Utilisateurs inscrits", data.metrics.users, Users], ["Inscriptions (24 h)", signups24h, UserPlus], ["Temps moyen / session", usage?.sessions ? formatDuration(usage.avg_session_seconds) : "—", Clock], ["Section la plus utilisée", topSection, BarChart3], ["Générations Studio", data.business.studio_generations ?? 0, Sparkles]] as const;
  return <><div className="admin-kpi-grid">{cards.map(([label, value, Icon]) => <div className="admin-kpi" key={label}><Icon size={18} /><small>{label}</small><strong>{value}</strong></div>)}</div><div className="admin-columns"><section className="admin-card"><div className="admin-card-head"><h3>Derniers inscrits</h3><Users size={17} /></div><AdminTable headers={["Nom", "Email", "Inscription"]}>{data.users.slice(0, 8).map((user) => <div className="admin-row" key={user.id}><strong>{user.full_name || "Sans nom"}</strong><span>{user.email || "—"}</span><span>{new Date(user.created_at).toLocaleString("fr-FR")}</span></div>)}</AdminTable></section><section className="admin-card"><div className="admin-card-head"><h3>Dernières actions réelles</h3><FileText size={17} /></div>{data.audit.length ? data.audit.slice(0, 8).map((item) => <div className="admin-event" key={item.id}><strong>{item.action}</strong><span>{item.resource_type} · {new Date(item.created_at).toLocaleString("fr-FR")}</span></div>) : <Empty text="Aucune activité enregistrée." />}</section></div></>;
}

function UsageSection({ usage, days, onDaysChange }: { usage: UsageStats | null; days: number; onDaysChange: (days: number) => void }) {
  const rows = usage?.sections ?? [];
  const maxSeconds = Math.max(1, ...rows.map((row) => row.seconds));
  const totalSeconds = rows.reduce((sum, row) => sum + row.seconds, 0) || 1;
  const periods = [[1, "24 h"], [7, "7 jours"], [30, "30 jours"]] as const;
  const cards = [["Temps moyen / session", usage?.sessions ? formatDuration(usage.avg_session_seconds) : "—", Clock], ["Sessions", usage?.sessions ?? 0, Activity], ["Utilisateurs actifs", usage?.active_users ?? 0, Users], ["Actifs (24 h)", usage?.active_users_24h ?? 0, UserPlus]] as const;
  return <>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>{periods.map(([value, label]) => <button type="button" key={value} className={`admin-btn ${days === value ? "admin-btn-primary" : "admin-btn-soft"}`} onClick={() => onDaysChange(value)}>{label}</button>)}</div>
    <div className="admin-kpi-grid">{cards.map(([label, value, Icon]) => <div className="admin-kpi" key={label}><Icon size={18} /><small>{label}</small><strong>{value}</strong></div>)}</div>
    <section className="admin-card" style={{ marginBottom: 18 }}><div className="admin-card-head"><h3>Inscriptions récentes</h3><UserPlus size={17} /></div>{usage?.signups_by_day?.length ? <div className="admin-signup-chart">{usage.signups_by_day.map((day) => <div key={day.day} title={`${day.day} : ${day.count} inscription(s)`}><strong>{day.count}</strong><span style={{ height: `${Math.max(4, day.count / Math.max(1, ...usage.signups_by_day.map((item) => item.count)) * 90)}px` }} /><small>{new Date(day.day).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</small></div>)}</div> : <Empty text="Aucune inscription récente enregistrée." />}</section>
    <section className="admin-card">
      <div className="admin-card-head"><div><h3>Sections les plus utilisées</h3><p className="admin-help">Temps passé par section sur la période (onglet visible uniquement).</p></div><BarChart3 size={17} /></div>
      {rows.length ? <AdminTable headers={["Section", "Temps passé", "Part", "Visites", "Utilisateurs"]}>{rows.map((row) => <div className="admin-row" key={row.section}><strong>{row.section}</strong><span><span style={{ display: "block", height: 6, borderRadius: 4, background: "rgba(99,102,241,.18)", marginBottom: 4 }}><span style={{ display: "block", height: 6, borderRadius: 4, background: "#6366f1", width: `${Math.max(2, (row.seconds / maxSeconds) * 100)}%` }} /></span>{formatDuration(row.seconds)}</span><span>{Math.round((row.seconds / totalSeconds) * 100)} %</span><span>{Number(row.visits).toLocaleString("fr-FR")}</span><span>{Number(row.users).toLocaleString("fr-FR")}</span></div>)}</AdminTable> : <Empty text="Pas encore de données d'usage : le suivi démarre dès que les utilisateurs ouvrent l'app après le déploiement." />}
    </section>
  </>;
}

function UsersSection({ data, usage }: { data: AdminData; usage: UsageStats | null }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [grantUser, setGrantUser] = useState<string | null>(null);
  const [grantCredits, setGrantCredits] = useState("500");
  const [grantReason, setGrantReason] = useState("");
  const [message, setMessage] = useState("");
  const [range, setRange] = useState<"all" | "24h" | "7d" | "30d">("all");
  const [query, setQuery] = useState("");
  const rangeMs = { "24h": 24 * 3600 * 1000, "7d": 7 * 24 * 3600 * 1000, "30d": 30 * 24 * 3600 * 1000 } as const;
  const ageMs = (user: { created_at: string }) => Date.now() - new Date(user.created_at).getTime();
  const localCount = (ms: number) => data.users.filter((user) => ageMs(user) <= ms).length;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = data.users.filter((user) => (range === "all" || ageMs(user) <= rangeMs[range]) && (!normalizedQuery || (user.email ?? "").toLowerCase().includes(normalizedQuery) || (user.full_name ?? "").toLowerCase().includes(normalizedQuery)));
  const counters = [["Total inscrits", usage?.signups_total ?? data.metrics.users], ["Dernières 24 h", usage?.signups_24h ?? localCount(rangeMs["24h"])], ["7 derniers jours", usage?.signups_7d ?? localCount(rangeMs["7d"])], ["30 derniers jours", usage?.signups_30d ?? localCount(rangeMs["30d"])]] as const;
  const filters = [["all", "Tous"], ["24h", "24 h"], ["7d", "7 jours"], ["30d", "30 jours"]] as const;
  async function activate(userId: string) {
    setBusy(userId); setMessage("");
    const response = await fetch("/api/admin/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId, plan: "starter" }) });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Abonnement Vendeo activé." : payload.error ?? "Activation impossible.");
    setBusy(null);
  }
  async function grant(user: { id: string; email: string | null }) {
    const credits = Number(grantCredits);
    if (!Number.isInteger(credits) || credits < 1 || credits > 100000) { setMessage("La quantité doit être comprise entre 1 et 100 000 crédits."); return; }
    if (!window.confirm(`Offrir ${credits} crédits à ${user.email || user.id} ?`)) return;
    setBusy(user.id); setMessage("");
    const response = await fetch("/api/admin/credits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: user.id, credits, reason: grantReason, grant_id: crypto.randomUUID() }) });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? `Cadeau crédité. Nouveau solde : ${payload.balance ?? 0} crédits.` : payload.error ?? "Attribution impossible.");
    if (response.ok) { setGrantUser(null); setGrantReason(""); }
    setBusy(null);
  }
  return <>
    <div className="admin-kpi-grid">{counters.map(([label, value]) => <div className="admin-kpi" key={label}><UserPlus size={18} /><small>{label}</small><strong>{Number(value).toLocaleString("fr-FR")}</strong></div>)}</div>
    <section className="admin-card"><div className="admin-card-head"><h3>Utilisateurs inscrits ({filteredUsers.length})</h3><Users size={17} /></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {filters.map(([value, label]) => <button type="button" key={value} className={`admin-btn ${range === value ? "admin-btn-primary" : "admin-btn-soft"}`} onClick={() => setRange(value)}>{label}</button>)}
        <input style={{ flex: "1 1 180px", minWidth: 140 }} placeholder="Rechercher un nom ou un email…" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Rechercher un utilisateur" />
      </div>
      {message ? <p className="admin-action-message">{message}</p> : null}
      {filteredUsers.length ? <AdminTable headers={["Nom", "Email", "Inscription", "Abonnement", "Actions"]}>{filteredUsers.map((user) => <div className="admin-row admin-user-row" key={user.id}><strong>{user.full_name || "Sans nom"} {ageMs(user) <= rangeMs["24h"] ? <i className="admin-pill on">Nouveau</i> : null}</strong><span>{user.email || "—"}</span><span>{new Date(user.created_at).toLocaleString("fr-FR")}</span><span><i className={`admin-pill ${user.subscription?.status === "active" ? "on" : "off"}`}>{user.subscription?.status === "active" ? "Actif" : "Inactif"}</i></span><span className="admin-plan-actions"><button type="button" className="admin-btn admin-btn-primary" disabled={busy === user.id} onClick={() => void activate(user.id)}><BadgeCheck size={15} />Activer l’abonnement</button><button type="button" className="admin-btn admin-btn-soft" disabled={busy === user.id} onClick={() => setGrantUser(grantUser === user.id ? null : user.id)}><Gift size={15} />Donner des crédits</button>{grantUser === user.id ? <span className="admin-grant-form"><input type="number" min="1" max="100000" value={grantCredits} onChange={(event) => setGrantCredits(event.target.value)} aria-label="Quantité de crédits" /><input maxLength={200} placeholder="Motif (optionnel)" value={grantReason} onChange={(event) => setGrantReason(event.target.value)} aria-label="Motif du cadeau" /><button type="button" className="admin-btn admin-btn-primary" disabled={busy === user.id} onClick={() => void grant(user)}>Confirmer</button></span> : null}</span></div>)}</AdminTable> : <Empty text="Aucun inscrit pour ce filtre." />}
    </section>
  </>;
}
function SubscriptionsSection({ data }: { data: AdminData }) { const names = new Map(data.users.map((user) => [user.id, `${user.full_name || "Sans nom"} · ${user.email || "—"}`])); return <section className="admin-card"><div className="admin-card-head"><h3>Suivi des abonnements</h3><CreditCard size={17} /></div><AdminTable headers={["Utilisateur", "Plan", "Statut", "Fin de période"]}>{data.subscriptions.map((item) => <div className="admin-row" key={item.id}><strong>{names.get(item.user_id) || item.user_id}</strong><span>{item.plan}</span><span className={`admin-status ${item.status}`}>{item.status}</span><span>{item.current_period_end ? new Date(item.current_period_end).toLocaleDateString("fr-FR") : "—"}</span></div>)}</AdminTable></section>; }
function PurchasesSection({ data }: { data: AdminData }) { const names = new Map(data.users.map((user) => [user.id, user.full_name || user.email || user.id])); return <><section className="admin-card"><div className="admin-card-head"><h3>Recharges Studio</h3><Wallet size={17} /></div><AdminTable headers={["Utilisateur", "Crédits", "Montant", "Date"]}>{data.creditPurchases.map((item) => <div className="admin-row" key={item.id}><strong>{names.get(item.user_id)}</strong><span>{item.credits.toLocaleString("fr-FR")} crédits</span><span>{item.operation === "admin_grant" || item.metadata?.provider === "admin_grant" ? "Offert (admin)" : `${Number(item.metadata?.amount_xof ?? 0).toLocaleString("fr-FR")} XOF`}</span><span>{new Date(item.created_at).toLocaleString("fr-FR")}</span></div>)}</AdminTable></section><section className="admin-card"><div className="admin-card-head"><h3>Générations débitées</h3><Sparkles size={17} /></div><AdminTable headers={["Utilisateur", "Opération", "Modèle", "Crédits", "Date"]}>{data.creditTransactions.map((item) => <div className="admin-row" key={item.id}><strong>{names.get(item.user_id)}</strong><span>{item.operation || "Studio"}</span><span>{item.model || "—"}</span><span>-{item.credits}</span><span>{new Date(item.created_at).toLocaleString("fr-FR")}</span></div>)}</AdminTable></section></>; }
function PayoutsSection({ data, onRefresh }: { data: AdminData; onRefresh: () => void }) { const [form, setForm] = useState({ amount_xof: "", recipient_name: "", recipient_phone: "", recipient_method: "mtn_bj", recipient_country: "BJ" }); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false); async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); setMessage(""); const response = await fetch("/api/admin/payouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const result = await response.json().catch(() => ({})); setMessage(response.ok ? "Décaissement initié avec succès." : result.error || "Décaissement impossible."); if (response.ok) { setForm({ amount_xof: "", recipient_name: "", recipient_phone: "", recipient_method: "mtn_bj", recipient_country: "BJ" }); onRefresh(); } setBusy(false); } return <><section className="admin-card"><div className="admin-card-head"><h3>Retirer des fonds</h3><Send size={17} /></div><p className="admin-help">Réservé aux super administrateurs. Vérifie le bénéficiaire avant confirmation.</p><form className="admin-payout-form" onSubmit={submit}><input type="number" min="1000" placeholder="Montant en XOF" value={form.amount_xof} onChange={(event) => setForm({ ...form, amount_xof: event.target.value })} required /><input placeholder="Nom du bénéficiaire" value={form.recipient_name} onChange={(event) => setForm({ ...form, recipient_name: event.target.value })} required /><input placeholder="Téléphone international" value={form.recipient_phone} onChange={(event) => setForm({ ...form, recipient_phone: event.target.value })} required /><input placeholder="Réseau (ex. mtn_bj)" value={form.recipient_method} onChange={(event) => setForm({ ...form, recipient_method: event.target.value })} required /><button className="btn btn-dark" disabled={busy}>{busy ? "Traitement…" : "Confirmer le décaissement"}</button></form>{message ? <p className="admin-action-message">{message}</p> : null}</section><section className="admin-card"><div className="admin-card-head"><h3>Historique des décaissements</h3><Wallet size={17} /></div><AdminTable headers={["Bénéficiaire", "Montant", "Réseau", "Statut", "Date"]}>{(data.payouts ?? []).map((item) => <div className="admin-row" key={item.id}><strong>{item.recipient_name}</strong><span>{Number(item.amount_xof).toLocaleString("fr-FR")} XOF</span><span>{item.recipient_method}</span><span className={`admin-status ${item.status}`}>{item.status}</span><span>{new Date(item.created_at).toLocaleString("fr-FR")}</span></div>)}</AdminTable></section></>; }
function IntegrationsSection({ data }: { data: AdminData }) { return <><div className="admin-kpi-grid"><div className="admin-kpi"><Building2 size={18} /><small>Boutiques</small><strong>{data.stores.length}</strong></div><div className="admin-kpi"><Activity size={18} /><small>Comptes Meta</small><strong>{data.metaAccounts.length}</strong></div></div><section className="admin-card"><div className="admin-card-head"><h3>Santé des intégrations</h3><AlertTriangle size={17} /></div><AdminTable headers={["Service", "Nom", "Statut", "Dernière activité"]}>{data.stores.map((store) => <div className="admin-row" key={store.id}><strong>{store.platform}</strong><span>{store.store_name}</span><span className={`admin-status ${store.connection_status}`}>{store.connection_status}</span><span>{new Date().toLocaleDateString("fr-FR")}</span></div>)}{data.metaAccounts.map((account) => <div className="admin-row" key={account.id}><strong>Meta Ads</strong><span>{account.name || account.meta_account_id}</span><span className="admin-status connected">connecté</span><span>{account.last_synced_at ? new Date(account.last_synced_at).toLocaleString("fr-FR") : "Jamais"}</span></div>)}</AdminTable></section></>; }
function AuditSection({ data }: { data: AdminData }) { return <section className="admin-card"><div className="admin-card-head"><h3>Journal des actions sensibles</h3><FileText size={17} /></div><AdminTable headers={["Action", "Ressource", "Date"]}>{data.audit.map((item) => <div className="admin-row" key={item.id}><strong>{item.action}</strong><span>{item.resource_type} {item.resource_id ? `· ${item.resource_id.slice(0, 8)}…` : ""}</span><span>{new Date(item.created_at).toLocaleString("fr-FR")}</span></div>)}</AdminTable></section>; }
function AdminTable({ headers, children }: { headers: string[]; children: React.ReactNode }) { return <div className="admin-table" style={{ "--cols": headers.length } as React.CSSProperties}><div className="admin-row admin-row-head">{headers.map((header) => <span key={header}>{header}</span>)}</div>{children}</div>; }
function Empty({ text }: { text: string }) { return <div className="admin-empty">{text}</div>; }
