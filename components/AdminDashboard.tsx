"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, BarChart3, Building2, CreditCard, FileText, LogOut, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

type AdminData = {
  admin: { role: string };
  metrics: { users: number; stores: number; subscriptions: number; messages: number; metaAccounts: number };
  users: Array<{ id: string; email: string | null; full_name: string | null; created_at: string; subscription?: { plan: string; status: string } | null }>;
  stores: Array<{ id: string; store_name: string; platform: string; connection_status: string; user_id: string }>;
  subscriptions: Array<{ id: string; user_id: string; plan: string; status: string; messages_used_this_month: number; messages_limit: number }>;
  metaAccounts: Array<{ id: string; name: string | null; meta_account_id: string; last_synced_at: string | null }>;
  audit: Array<{ id: string; action: string; resource_type: string; resource_id?: string | null; created_at: string }>;
};

const sections = [["overview", "Vue générale", Activity], ["users", "Utilisateurs", Users], ["subscriptions", "Abonnements", CreditCard], ["integrations", "Intégrations", Building2], ["audit", "Journal d’audit", FileText]] as const;

export function AdminDashboard() {
  const [active, setActive] = useState("overview");
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/overview");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error ?? "Accès administrateur refusé.");
    else setData(payload);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function signOut() {
    await fetch("/api/admin/password-logout", { method: "POST" });
    await createClient().auth.signOut();
    window.location.href = "/admin/login";
  }

  if (loading) return <main className="admin-shell"><div className="admin-loading">Chargement de la console administrateur…</div></main>;
  if (error || !data) return <main className="admin-shell"><div className="admin-error"><ShieldCheck size={25} /><h1>Accès administrateur</h1><p>{error || "Ton compte est connecté, mais il n’a pas encore été autorisé comme administrateur."}</p>{error?.includes("Authentification") ? <a className="admin-link" href="/admin/login">Se connecter</a> : <p className="admin-help">Un administrateur doit ajouter ton utilisateur dans la table <code>admin_users</code>.</p>}</div></main>;

  return <main className="admin-shell">
    <header className="admin-header"><div><span className="admin-kicker">Vendeo interne</span><h1>Console administrateur</h1></div><div className="admin-header-actions"><span className="admin-role">{data.admin.role}</span><button type="button" onClick={signOut} className="admin-logout"><LogOut size={15} /> Déconnexion</button></div></header>
    <div className="admin-layout">
      <aside className="admin-sidebar">{sections.map(([key, label, Icon]) => <button type="button" key={key} className={active === key ? "active" : ""} onClick={() => setActive(key)}><Icon size={17} /><span>{label}</span></button>)}</aside>
      <section className="admin-content">
        <div className="admin-toolbar"><div><span className="admin-kicker">Pilotage plateforme</span><h2>{sections.find(([key]) => key === active)?.[1]}</h2></div><button type="button" className="admin-refresh" onClick={() => void load()}><RefreshCw size={15} /> Actualiser</button></div>
        {active === "overview" && <Overview data={data} />}
        {active === "users" && <UsersSection data={data} />}
        {active === "subscriptions" && <SubscriptionsSection data={data} />}
        {active === "integrations" && <IntegrationsSection data={data} />}
        {active === "audit" && <AuditSection data={data} />}
      </section>
    </div>
  </main>;
}

function Overview({ data }: { data: AdminData }) {
  const cards = [["Utilisateurs", data.metrics.users, Users], ["Boutiques connectées", data.metrics.stores, Building2], ["Abonnements", data.metrics.subscriptions, CreditCard], ["Messages IA", data.metrics.messages, BarChart3], ["Comptes Meta Ads", data.metrics.metaAccounts, Activity]] as const;
  return <><div className="admin-kpi-grid">{cards.map(([label, value, Icon]) => <div className="admin-kpi" key={label}><Icon size={18} /><small>{label}</small><strong>{value.toLocaleString("fr-FR")}</strong></div>)}</div><div className="admin-columns"><section className="admin-card"><div className="admin-card-head"><h3>Derniers utilisateurs</h3><Users size={17} /></div><AdminTable headers={["Nom", "Email", "Inscription"]}>{data.users.slice(0, 8).map((user) => <div className="admin-row" key={user.id}><strong>{user.full_name || "Sans nom"}</strong><span>{user.email || "—"}</span><span>{new Date(user.created_at).toLocaleDateString("fr-FR")}</span></div>)}</AdminTable></section><section className="admin-card"><div className="admin-card-head"><h3>Dernières actions</h3><FileText size={17} /></div>{data.audit.length ? data.audit.slice(0, 8).map((item) => <div className="admin-event" key={item.id}><strong>{item.action}</strong><span>{item.resource_type} · {new Date(item.created_at).toLocaleString("fr-FR")}</span></div>) : <Empty text="Aucune action administrateur enregistrée." />}</section></div></>;
}

function UsersSection({ data }: { data: AdminData }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function activate(userId: string, plan: "starter" | "pro") {
    setBusy(userId); setMessage("");
    const response = await fetch("/api/admin/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId, plan }) });
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? `Abonnement ${plan === "pro" ? "Pro" : "Starter"} activé.` : payload.error ?? "Activation impossible.");
    setBusy(null);
  }
  return <section className="admin-card"><div className="admin-card-head"><h3>Utilisateurs inscrits</h3><Users size={17} /></div>{message ? <p className="admin-action-message">{message}</p> : null}<AdminTable headers={["Nom", "Email", "Inscription", "Abonnement", "Actions"]}>{data.users.map((user) => <div className="admin-row admin-user-row" key={user.id}><strong>{user.full_name || "Sans nom"}</strong><span>{user.email || "—"}</span><span>{new Date(user.created_at).toLocaleDateString("fr-FR")}</span><span>{user.subscription?.status === "active" ? `Actif · ${user.subscription.plan}` : "Inactif"}</span><span className="admin-plan-actions"><button disabled={busy === user.id} onClick={() => void activate(user.id, "starter")}>Starter</button><button disabled={busy === user.id} onClick={() => void activate(user.id, "pro")}>Pro</button></span></div>)}</AdminTable></section>;
}
function SubscriptionsSection({ data }: { data: AdminData }) { return <section className="admin-card"><div className="admin-card-head"><h3>Suivi des abonnements</h3><CreditCard size={17} /></div><AdminTable headers={["Utilisateur", "Plan", "Statut", "Usage IA"]}>{data.subscriptions.map((item) => <div className="admin-row" key={item.id}><code>{item.user_id.slice(0, 8)}…</code><strong>{item.plan}</strong><span className={`admin-status ${item.status}`}>{item.status}</span><span>{item.messages_used_this_month} / {item.messages_limit}</span></div>)}</AdminTable></section>; }
function IntegrationsSection({ data }: { data: AdminData }) { return <><div className="admin-kpi-grid"><div className="admin-kpi"><Building2 size={18} /><small>Boutiques</small><strong>{data.stores.length}</strong></div><div className="admin-kpi"><Activity size={18} /><small>Comptes Meta</small><strong>{data.metaAccounts.length}</strong></div></div><section className="admin-card"><div className="admin-card-head"><h3>Santé des intégrations</h3><AlertTriangle size={17} /></div><AdminTable headers={["Service", "Nom", "Statut", "Dernière activité"]}>{data.stores.map((store) => <div className="admin-row" key={store.id}><strong>{store.platform}</strong><span>{store.store_name}</span><span className={`admin-status ${store.connection_status}`}>{store.connection_status}</span><span>{new Date().toLocaleDateString("fr-FR")}</span></div>)}{data.metaAccounts.map((account) => <div className="admin-row" key={account.id}><strong>Meta Ads</strong><span>{account.name || account.meta_account_id}</span><span className="admin-status connected">connecté</span><span>{account.last_synced_at ? new Date(account.last_synced_at).toLocaleString("fr-FR") : "Jamais"}</span></div>)}</AdminTable></section></>; }
function AuditSection({ data }: { data: AdminData }) { return <section className="admin-card"><div className="admin-card-head"><h3>Journal des actions sensibles</h3><FileText size={17} /></div><AdminTable headers={["Action", "Ressource", "Date"]}>{data.audit.map((item) => <div className="admin-row" key={item.id}><strong>{item.action}</strong><span>{item.resource_type} {item.resource_id ? `· ${item.resource_id.slice(0, 8)}…` : ""}</span><span>{new Date(item.created_at).toLocaleString("fr-FR")}</span></div>)}</AdminTable></section>; }
function AdminTable({ headers, children }: { headers: string[]; children: React.ReactNode }) { return <div className="admin-table"><div className="admin-row admin-row-head">{headers.map((header) => <span key={header}>{header}</span>)}</div>{children}</div>; }
function Empty({ text }: { text: string }) { return <div className="admin-empty">{text}</div>; }
