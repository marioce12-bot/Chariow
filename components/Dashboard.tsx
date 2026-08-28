"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BarChart3, CreditCard, Plus, Settings, Store, MessageSquare, LayoutDashboard } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useSearchParams } from "next/navigation";

const bars = [32, 44, 39, 55, 48, 65, 57, 71, 64, 82, 74, 91, 79, 96];

type StoreData = {
  id: string;
  platform: string;
  store_name: string;
  mcp_url: string | null;
  is_active: boolean;
  connection_status?: string;
  connection_error?: string | null;
};

type SubscriptionData = {
  plan: "starter" | "pro";
  messages_used_this_month: number;
  messages_limit: number;
  free_messages_used: number;
  free_messages_limit: number;
  status: string;
};

type AnalyticsData = { store?: unknown; products?: unknown; salesAnalytics?: unknown; storeAnalytics?: unknown } | null;

export function Dashboard() {
  const [active, setActive] = useState("Vue d’ensemble");
  const searchParams = useSearchParams();
  const [stores, setStores] = useState<StoreData[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData>(null);

  const links = [
    ["Vue d’ensemble", LayoutDashboard],
    ["Mon analyste IA", MessageSquare],
    ["Mes boutiques", Store],
    ["Rapports", BarChart3],
    ["Abonnement", CreditCard],
  ] as const;

  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "/";
  }

  useEffect(() => {
    const s = searchParams.get("chariow");
    if (s && ["connected", "failed", "expired", "revoked", "pending"].includes(s)) {
      setActive("Mes boutiques");
    }
  }, [searchParams]);

  useEffect(() => {
    Promise.all([
      fetch("/api/stores").then((r) => (r.ok ? r.json() : { stores: [] })),
      fetch("/api/subscription").then((r) => (r.ok ? r.json() : { subscription: null })),
    ])
      .then(async ([storeResult, subscriptionResult]) => {
        const nextStores = storeResult.stores ?? [];
        setStores(nextStores);
        setSubscription(subscriptionResult.subscription ?? null);
        if (nextStores.length) {
          const analyticsResult = await fetch(`/api/analytics?store_id=${nextStores[0].id}`);
          if (analyticsResult.ok) setAnalytics((await analyticsResult.json()).snapshot ?? null);
        }
      })
      .finally(() => setLoadingData(false));
  }, []);

  return (
    <main className="app-shell">
      <header className="app-header">
        <Link href="/" className="brand">
          <Image className="brand-logo" src="/vendeo-logo-light.svg" alt="Vendeo" width={150} height={40} />
        </Link>
        <div className="app-user">
          <span style={{ color: "#c7d2fe", fontSize: 12 }}>Bonjour, créateur</span>
          <span className="avatar">VC</span>
          <button onClick={signOut} style={{ background: "transparent", border: 0, color: "#c7d2fe", fontSize: 11 }}>
            Déconnexion
          </button>
        </div>
      </header>
      <div className="app-layout">
        <aside className="sidebar">
          <div className="side-label">Workspace</div>
          {links.map(([name, Icon]) => (
            <button key={name} className={`side-link ${active === name ? "active" : ""}`} onClick={() => setActive(name)}>
              <Icon size={16} />
              {name}
            </button>
          ))}
          <div className="side-label" style={{ marginTop: 28 }}>
            Compte
          </div>
          <button className="side-link">
            <Settings size={16} />Paramètres
          </button>
          <div style={{ background: "linear-gradient(135deg,#ede9fe,#e0f2fe)", borderRadius: 10, margin: "35px 4px 0", padding: 14 }}>
            <span className="eyebrow" style={{ fontSize: 9 }}>
              Plan {subscription?.plan === "pro" ? "Pro" : "Starter"}
            </span>
            <p style={{ fontSize: 11, lineHeight: 1.5, margin: "9px 0", color: "#334155" }}>Passe au Pro pour débloquer les rapports.</p>
            <button className="btn btn-dark" style={{ fontSize: 10, padding: "8px 10px", width: "100%" }}>Passer au Pro</button>
          </div>
        </aside>
        <section className="app-main">
          {loadingData ? (
            <div className="app-card">Chargement de ton espace…</div>
          ) : stores.length === 0 && active !== "Mes boutiques" ? (
            <StoreOnboarding />
          ) : active === "Mon analyste IA" ? (
            <ChatView />
          ) : active === "Mes boutiques" ? (
            <StoresView stores={stores} onStoresChange={setStores} />
          ) : active === "Abonnement" ? (
            <SubscriptionView subscription={subscription} />
          ) : (
            <Overview stores={stores} subscription={subscription} analytics={analytics} />
          )}
        </section>
      </div>
    </main>
  );
}

function StoreOnboarding() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setError("");
    setSaving(true);
    try {
      // Redirection HTTP : connect va mener OAuth Chariow.
      window.location.href = "/api/integrations/chariow/connect";
    } catch {
      setError("Connexion Chariow indisponible pour le moment.");
      setSaving(false);
    }
  }

  return (
    <div className="onboarding-wrap">
      <div className="onboarding-card">
        <span className="onboarding-icon">
          <Store size={26} />
        </span>
        <span className="eyebrow">Première étape</span>
        <h1>Connecter ma boutique Chariow</h1>
        <p className="onboarding-lead">Chariow ouvre la connexion et vous autorisez Vendeo. Aucun token à copier.</p>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-dark" disabled={saving} style={{ width: "100%", marginTop: 18 }} onClick={connect}>
          {saving ? "Connexion en cours…" : "Connecter ma boutique Chariow"} <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}

function Overview({ stores, subscription, analytics }: { stores: StoreData[]; subscription: SubscriptionData | null; analytics: AnalyticsData }) {
  const freeUsed = subscription?.free_messages_used ?? 0;
  const freeLimit = subscription?.free_messages_limit ?? 3;
  const used = subscription?.messages_used_this_month ?? 0;
  const limit = subscription?.messages_limit ?? 400;
  const percent = freeUsed < freeLimit ? Math.round((freeUsed / freeLimit) * 100) : Math.min(100, Math.round((used / limit) * 100));
  const analyticsText = analytics ? JSON.stringify(analytics) : "";
  const revenue = analyticsText.match(/(?:revenue|total_revenue|amount)[^\d]{0,20}(\d[\d ,.]*)/i)?.[1] ?? "—";

  return (
    <>
      <div className="page-top">
        <div>
          <span className="eyebrow">Ton espace Vendeo</span>
          <h1>Vue d'ensemble</h1>
          <p>Voici ce qui se passe dans ton business ce mois-ci.</p>
        </div>
        <button className="btn btn-dark" onClick={() => document.querySelector<HTMLButtonElement>(".side-link:nth-of-type(4)")?.click()}>
          <Plus size={16} /> Connecter une boutique
        </button>
      </div>
      <div className="overview-grid">
        <div className="metric">
          <small>CA ce mois</small>
          <strong>{revenue}</strong>
          <span className="up">Données Chariow</span>
        </div>
        <div className="metric">
          <small>Produits</small>
          <strong>{Array.isArray(analytics?.products) ? analytics.products.length : "—"}</strong>
          <span className="up">Catalogue connecté</span>
        </div>
        <div className="metric">
          <small>Analytics</small>
          <strong>{analytics ? "Actifs" : "—"}</strong>
          <span className="up">Synchronisation MCP</span>
        </div>
        <div className="metric">
          <small>Boutiques actives</small>
          <strong>{stores.length}</strong>
          <span className="up">{stores.length ? "Connexion active" : "Aucune connexion"}</span>
        </div>
      </div>
      <div className="content-grid">
        <div className="app-card">
          <div className="card-head">
            <div>
              <h2>Evolution du chiffre d'affaires</h2>
              <p>{analytics ? "Analytics Chariow du mois en cours" : "Les données apparaîtront après la connexion MCP"}</p>
            </div>
          </div>
          {analytics ? (
            <pre className="analytics-preview">{JSON.stringify(analytics.storeAnalytics ?? analytics.salesAnalytics, null, 2).slice(0, 1800)}</pre>
          ) : (
            <div className="empty-state">Connecte ta boutique pour visualiser tes ventes réelles.</div>
          )}
        </div>
        <div className="app-card">
          <div className="card-head">
            <div>
              <h2>Tes boutiques</h2>
              <p>{stores.length} connexion(s) active(s)</p>
            </div>
          </div>
          {stores.length ? (
            stores.map((store) => (
              <div className="store-row" key={store.id}>
                <div className="store-logo">{store.platform.slice(0, 1).toUpperCase()}</div>
                <div className="store-info">
                  <strong>{store.store_name}</strong>
                  <span>
                    {store.platform} · {store.connection_status ?? "pending"}
                  </span>
                </div>
                <span className="status">● {store.connection_status ?? "pending"}</span>
              </div>
            ))
          ) : (
            <div className="empty-state compact">Aucune boutique connectée.</div>
          )}
          <div style={{ borderTop: "1px solid #dfe5de", paddingTop: 18, marginTop: 15 }}>
            <div className="eyebrow" style={{ fontSize: 9 }}>
              {freeUsed < freeLimit ? "Essai gratuit Vendeo" : "Usage IA ce mois"}
            </div>
            <div className="usage">
              <div className="ring">
                <strong>{freeUsed < freeLimit ? freeUsed : used}</strong>
              </div>
              <div className="usage-copy">
                <strong>{freeUsed < freeLimit ? `${freeUsed} / ${freeLimit}` : `${used} / ${limit}`}</strong>
                <span>{freeUsed < freeLimit ? "requêtes gratuites" : "messages utilisés"}</span>
              </div>
            </div>
            <div className="progress">
              <i style={{ width: `${percent}%` }} />
            </div>
            <p style={{ color: "#809087", fontSize: 10 }}>
              {freeUsed < freeLimit ? `Il te reste ${freeLimit - freeUsed} requêtes gratuites.` : `Il te reste ${Math.max(0, limit - used)} messages ce mois-ci.`}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function ChatView() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [usage, setUsage] = useState<{ free_used: number; free_limit: number; used: number; limit: number } | null>(null);
  const [plansRequired, setPlansRequired] = useState(false);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((data) => setMessages(data.messages ?? []));
    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : { subscription: null }))
      .then((data) => setUsage(data.subscription ? { free_used: data.subscription.free_messages_used, free_limit: data.subscription.free_messages_limit, used: data.subscription.messages_used_this_month, limit: data.subscription.messages_limit } : null));
  }, []);

  async function send(message = input) {
    if (!message.trim() || sending || plansRequired) return;
    setSending(true);
    setInput("");
    const userMessage = { role: "user", content: message };
    setMessages((current) => [...current, userMessage]);
    const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
    const data = await response.json();
    if (response.ok && data.message) {
      setMessages((current) => [...current, data.message]);
      if (data.usage) {
        setUsage({ free_used: data.usage.free_used, free_limit: data.usage.free_limit, used: data.usage.used, limit: data.usage.limit });
      }
    } else {
      if (data.code === "PLANS_REQUIRED") setPlansRequired(true);
      setMessages((current) => [...current, { role: "assistant", content: data.error ?? "Une erreur est survenue." }]);
    }
    setSending(false);
  }

  const freeRemaining = usage ? Math.max(0, usage.free_limit - usage.free_used) : 3;

  return (
    <>
      <div className="page-top">
        <div>
          <span className="eyebrow">Ton analyste IA</span>
          <h1>On regarde ça ensemble ?</h1>
          <p>Pose une question sur tes ventes, tes produits ou ta stratégie.</p>
        </div>
      </div>
      <div className="app-card" style={{ maxWidth: 760, minHeight: 480, display: "flex", flexDirection: "column" }}>
        {usage && (
          <div className="trial-banner">
            {plansRequired ? (
              <>
                <strong>Ton essai gratuit est terminé.</strong> Choisis un plan pour continuer. <button className="btn btn-dark" onClick={() => document.querySelector<HTMLButtonElement>(".side-link:nth-of-type(6)")?.click()} style={{ fontSize: 10, padding: "7px 10px", marginLeft: 8 }}>Voir les offres</button>
              </>
            ) : (
              <>
                <strong>
                  {freeRemaining} requête{freeRemaining > 1 ? "s" : ""} gratuite{freeRemaining > 1 ? "s" : ""}
                </strong>
                {' '}restante{freeRemaining > 1 ? "s" : ""}. Découvre Vendeo avant de choisir ton plan.
              </>
            )}
          </div>
        )}
        <div className="chat-messages">
          {messages.length === 0 && <div className="empty-state"><b>✦ Vendeo</b><br />Tu as 3 requêtes gratuites pour découvrir ton analyste IA.</div>}
          {messages.map((message, index) => (
            <div key={index} className={message.role === "user" ? "chat-bubble user" : "chat-bubble assistant"}>
              {message.content}
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 15 }}>
            {["Voir mes ventes", "Analyser mes produits", "Idées de bundle"].map((x) => (
              <button key={x} className="btn btn-ghost" disabled={plansRequired} onClick={() => send(x)} style={{ fontSize: 11, padding: "9px 12px" }}>
                {x}
              </button>
            ))}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void send(); }} style={{ border: "1px solid #dfe5de", borderRadius: 8, display: "flex", padding: 6 }}>
            <input disabled={plansRequired} value={input} onChange={(event) => setInput(event.target.value)} placeholder={plansRequired ? "Choisis un plan pour continuer" : "Pose ta question..."} style={{ border: 0, flex: 1, outline: 0, padding: 8, fontSize: 12 }} />
            <button className="btn btn-dark" disabled={sending || plansRequired} style={{ borderRadius: 6, fontSize: 11, padding: "9px 14px" }}>
              {sending ? "…" : plansRequired ? "Plans" : "Envoyer"}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

function StoresView({ stores, onStoresChange }: { stores: StoreData[]; onStoresChange: (stores: StoreData[]) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function connectChariow() {
    setError("");
    setSaving(true);
    try {
      window.location.href = "/api/integrations/chariow/connect";
    } finally {
      setSaving(false);
    }
  }

  async function disconnectChariow(id: string) {
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/integrations/chariow/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Impossible de déconnecter.");
        return;
      }
      onStoresChange(stores.map((s) => (s.id === id ? data.store : s)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-top">
        <div>
          <span className="eyebrow">Connexions</span>
          <h1>Mes boutiques</h1>
          <p>Une source de vérité pour toutes tes ventes.</p>
        </div>
        <button className="btn btn-dark" onClick={connectChariow} disabled={saving}>
          <Plus size={16} /> {saving ? "Connexion…" : "Connecter ma boutique Chariow"}
        </button>
      </div>

      {error && <p style={{ color: "#a64635", fontSize: 12 }}>{error}</p>}

      <div className="app-card" style={{ maxWidth: 760 }}>
        {stores.map((store) => {
          const status = store.connection_status ?? "pending";
          const canDisconnect = status === "connected";
          return (
            <div className="store-row" key={store.id}>
              <div className="store-logo">{store.platform.slice(0, 1).toUpperCase()}</div>
              <div className="store-info">
                <strong>{store.store_name}</strong>
                <span>
                  {store.platform} · {status}
                </span>
              </div>
              <span className="status">● {status}</span>
              {canDisconnect ? (
                <button className="btn btn-ghost" onClick={() => disconnectChariow(store.id)} disabled={saving} style={{ fontSize: 10, padding: "7px 10px" }}>
                  Déconnecter
                </button>
              ) : (
                <button className="btn btn-ghost" onClick={connectChariow} disabled={saving} style={{ fontSize: 10, padding: "7px 10px" }}>
                  {status === "failed" || status === "expired" ? "Reconnecter Chariow" : "Connecter ma boutique Chariow"}
                </button>
              )}
            </div>
          );
        })}
        {stores.length === 0 && <div className="empty-state compact">Aucune boutique connectée.</div>}

        <div style={{ border: "1px dashed #cdd9cd", borderRadius: 9, marginTop: 18, padding: 28, textAlign: "center" }}>
          <Store size={24} color="#6d9072" />
          <p style={{ fontSize: 13, margin: "10px 0 3px" }}>Le parcours est 100% OAuth + PKCE.</p>
          <span style={{ color: "#819087", fontSize: 11 }}>Vous connectez une boutique sans URL/token.</span>
        </div>
      </div>
    </>
  );
}

function SubscriptionView({ subscription }: { subscription: SubscriptionData | null }) {
  const plan = subscription?.plan ?? "starter";

  async function changePlan(nextPlan: "starter" | "pro") {
    const response = await fetch("/api/subscription/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: nextPlan }),
    });
    const data = await response.json();
    if (response.ok && data.payment?.url) {
      window.location.href = data.payment.url;
    } else {
      window.alert(data.error ?? "Impossible de lancer le paiement.");
    }
  }

  return (
    <>
      <div className="page-top">
        <div>
          <span className="eyebrow">Ton abonnement</span>
          <h1>Grandis à ton rythme.</h1>
          <p>Gère ton plan et ton usage IA depuis un seul endroit.</p>
        </div>
      </div>
      <div className="pricing-wrap" style={{ maxWidth: 800 }}>
        <article className="price-card">
          <span className="eyebrow">{plan === "starter" ? "Plan actuel" : "Plan disponible"}</span>
          <h3>Starter</h3>
          <div className="price">3 000 F <small>/ mois</small></div>
          <ul>
            <li>✓ 400 messages IA / mois</li>
            <li>✓ 1 boutique connectée</li>
            <li>✓ Support standard</li>
          </ul>
          <button className="btn btn-ghost" disabled={plan === "starter"} onClick={() => changePlan("starter")} style={{ width: "100%" }}>
            {plan === "starter" ? "Plan actuel" : "Choisir Starter"}
          </button>
        </article>
        <article className="price-card pro">
          <span className="pill" style={{ marginBottom: 18 }}>Recommandé</span>
          <h3>Pro</h3>
          <div className="price">5 000 F <small>/ mois</small></div>
          <ul>
            <li>✓ 1 200 messages IA / mois</li>
            <li>✓ Jusqu'à 3 boutiques</li>
            <li>✓ Rapports automatiques</li>
            <li>✓ Support prioritaire</li>
          </ul>
          <button className="btn btn-lime" disabled={plan === "pro"} onClick={() => changePlan("pro")} style={{ width: "100%" }}>
            {plan === "pro" ? "Plan actuel" : "Passer au Pro"}
          </button>
        </article>
      </div>
    </>
  );
}
