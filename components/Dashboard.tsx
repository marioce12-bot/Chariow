"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BarChart3, CreditCard, Plus, Settings, Store, MessageSquare, LayoutDashboard, Package, CalendarDays, Users, Eye, ShoppingBag, Lightbulb } from "lucide-react";
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

type ProductData = { id: string; name: string; description: string | null; price: number | string | null; currency: string | null; status: string | null; image: string | null; createdAt: string | null; sales: number | null };
type AnalyticsData = {
  storeName: string;
  storeStatus: string;
  products: ProductData[];
  sales: unknown[];
  kpis: { period: { from: string | null; to: string | null }; revenue: { value: number | string | null; formatted: string | null }; sales: number; visits: number; conversionRate: string; customers: number; productsSold: number };
} | null;

export function Dashboard() {
  const [active, setActive] = useState("Vue d’ensemble");
  const searchParams = useSearchParams();
  const [stores, setStores] = useState<StoreData[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData>(null);
  const [userName, setUserName] = useState("créateur");

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
    let cancelled = false;
    const client = createClient();
    client.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const metadata = data.user?.user_metadata as { full_name?: string; name?: string; first_name?: string } | undefined;
      const name = metadata?.full_name ?? metadata?.name ?? metadata?.first_name ?? data.user?.email?.split("@")[0];
      if (name) setUserName(name);
    });

    async function loadDashboard() {
      const storeResponse = await fetch("/api/stores");
      const storeResult = storeResponse.ok ? await storeResponse.json() : { stores: [] };
      if (cancelled) return;
      const nextStores = storeResult.stores ?? [];
      setStores(nextStores);
      setLoadingData(false);

      const subscriptionPromise = fetch("/api/subscription").then((r) => (r.ok ? r.json() : { subscription: null }));
      const analyticsPromise = nextStores.length
        ? fetch(`/api/analytics?store_id=${encodeURIComponent(nextStores[0].id)}`).then((r) => (r.ok ? r.json() : null))
        : Promise.resolve(null);
      const [subscriptionResult, analyticsResult] = await Promise.all([subscriptionPromise, analyticsPromise]);
      if (cancelled) return;
      setSubscription(subscriptionResult.subscription ?? null);
      setAnalytics(analyticsResult?.snapshot ?? null);
    }

    loadDashboard().catch(() => {
      if (!cancelled) setLoadingData(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="app-shell">
      <header className="app-header">
        <Link href="/" className="brand">
          <Image className="brand-logo" src="/vendeo-logo-light.svg" alt="Vendeo" width={150} height={40} />
        </Link>
        <div className="app-user">
          <span className="app-greeting">Bonjour, {userName}</span>
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
          ) : active === "Rapports" ? (
            <Reports stores={stores} analytics={analytics} />
          ) : (
            <Overview stores={stores} subscription={subscription} analytics={analytics} />
          )}
        </section>
      </div>

      <nav className="mobile-nav" aria-label="Navigation mobile">
        <button type="button" className={`nav-btn ${active === "Vue d’ensemble" ? "active" : ""}`} onClick={() => setActive("Vue d’ensemble")}>
          <LayoutDashboard size={18} />
          <span>Accueil</span>
        </button>
        <button type="button" className={`nav-btn ${active === "Mon analyste IA" ? "active" : ""}`} onClick={() => setActive("Mon analyste IA")}>
          <MessageSquare size={18} />
          <span>IA</span>
        </button>
        <button type="button" className={`nav-btn ${active === "Mes boutiques" ? "active" : ""}`} onClick={() => setActive("Mes boutiques")}>
          <Store size={18} />
          <span>Boutiques</span>
        </button>
        <button type="button" className={`nav-btn ${active === "Rapports" ? "active" : ""}`} onClick={() => setActive("Rapports")}>
          <BarChart3 size={18} />
          <span>Rapports</span>
        </button>
        <button type="button" className={`nav-btn ${active === "Abonnement" ? "active" : ""}`} onClick={() => setActive("Abonnement")}>
          <CreditCard size={18} />
          <span>Plan</span>
        </button>
      </nav>
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

  const storeStatus = stores?.[0]?.connection_status ?? "pending";

  const periodFrom = analytics?.kpis.period.from;
  const periodTo = analytics?.kpis.period.to;

  const monthNames = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const formatFrenchDate = (d: string) => {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d;
    const day = dt.getDate();
    const month = monthNames[dt.getMonth()] ?? "";
    const year = dt.getFullYear();
    return `${day} ${month} ${year}`;
  };
  const periodLabel = periodFrom && periodTo ? `${formatFrenchDate(periodFrom)} – ${formatFrenchDate(periodTo)}` : "";

  const catalogueCount = analytics?.products.length ?? 0;
  const salesCount = analytics?.kpis.sales ?? 0;
  const salesValueFormatted = analytics?.kpis.revenue.formatted ?? "0";
  const productsSold = analytics?.kpis.productsSold ?? 0;
  const visitsTotal = analytics?.kpis.visits ?? 0;
  const conversionFormatted = analytics?.kpis.conversionRate ?? "0 %";
  const customersTotal = analytics?.kpis.customers ?? 0;

  const connectionCopy: Record<string, string> = {
    connected: "✅ Boutique Chariow connectée",
    pending: "Connexion à Chariow en cours…",
    failed: "❌ Impossible de connecter la boutique. Réessaie.",
    expired: "⚠️ La connexion Chariow a expiré. Reconnecte ta boutique.",
    revoked: "Boutique déconnectée",
  };

  return (
    <>
      <div className="page-top">
        <div>
          <h1>Vue d'ensemble</h1>
          <p>{periodLabel ? `Période analysée : ${periodLabel}` : "Période analysée : période en cours"}</p>
        </div>
        <button className="btn btn-dark" onClick={() => document.querySelector<HTMLButtonElement>(".side-link:nth-of-type(4)")?.click()}>
          <Plus size={16} /> Boutique
        </button>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div className="app-card">
          <div style={{ fontWeight: 800, color: "#234d3d" }}>
            {stores.length === 0 ? "Connecte ta boutique Chariow pour voir tes statistiques." : (connectionCopy[storeStatus] ?? "Connecte ta boutique Chariow pour voir tes statistiques.")}
          </div>
        </div>
      </div>

      {stores.length === 0 || storeStatus !== "connected" ? (
        <div className="empty-state" style={{ marginTop: 10 }}>
          {stores.length === 0
            ? "Connecte ta boutique Chariow pour voir tes statistiques."
            : connectionCopy[storeStatus] ?? "Connecte ta boutique Chariow pour voir tes statistiques."}
        </div>
      ) : (
        <>
          {!analytics ? (
            <div className="empty-state" style={{ marginTop: 10 }}>
              Les statistiques de ta boutique ne sont pas encore disponibles. Réessaie plus tard.
            </div>
          ) : (
            <>
            <div className="overview-grid">
              <div className="metric">
                <small>Chiffre d’affaires ce mois</small>
                <strong>{salesValueFormatted}</strong>
              </div>
              <div className="metric">
                <small>Ventes réalisées</small>
                <strong>{salesCount}</strong>
              </div>
              <div className="metric">
                <small>Produits du catalogue</small>
                <strong>{catalogueCount}</strong>
              </div>
              <div className="metric">
                <small>Produits vendus ce mois</small>
                <strong>{productsSold}</strong>
              </div>
              <div className="metric">
                <small>Visites de la boutique</small>
                <strong>{visitsTotal}</strong>
              </div>
              <div className="metric">
                <small>Taux de conversion</small>
                <strong>{conversionFormatted}</strong>
              </div>
              <div className="metric">
                <small>Clients</small>
                <strong>{customersTotal}</strong>
              </div>
            </div>
      <div className="app-card" style={{ marginTop: 18 }}>
              <strong>{salesCount === 0 && visitsTotal === 0 ? "Aucune vente ni visite n’a été enregistrée pour cette période." : "Ton activité sur cette période"}</strong>
              {catalogueCount > 0 && <p style={{ margin: "8px 0 0", color: "#607268", fontSize: 12 }}>Tu as {catalogueCount} produit{catalogueCount > 1 ? "s" : ""} dans ton catalogue.</p>}
              {salesCount === 0 && <p style={{ margin: "8px 0 0", color: "#607268", fontSize: 12 }}>Aucune vente enregistrée pour cette période.</p>}
              {visitsTotal === 0 && <p style={{ margin: "8px 0 0", color: "#607268", fontSize: 12 }}>Aucune visite enregistrée pour cette période.</p>}
            </div>
            <ProductCatalog products={analytics.products} />
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 18 }}>
        <div className="app-card">
          <div className="card-head">
            <div>
              <h2>Votre suivi Vendeo</h2>
              <p>Votre progression d’utilisation cette période.</p>
            </div>
          </div>
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
              {freeUsed < freeLimit
                ? `Il te reste ${freeLimit - freeUsed} requêtes gratuites.`
                : `Il te reste ${Math.max(0, limit - used)} messages ce mois-ci.`}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function ProductCatalog({ products }: { products: ProductData[] }) {
  return (
    <div className="app-card" style={{ marginTop: 18 }}>
      <div className="card-head"><div><h2>Ton catalogue</h2><p>{products.length ? "Les produits récupérés depuis ta boutique Chariow." : "Aucun produit n’a été trouvé dans ta boutique Chariow."}</p></div></div>
      {products.length > 0 && <div style={{ display: "grid", gap: 10, marginTop: 15 }}>
        {products.map((product) => <div key={product.id} className="store-row">
          <div className="store-logo">{product.image ? <img src={product.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} /> : <Package size={18} />}</div>
          <div className="store-info"><strong>{product.name}</strong><span>{formatProductPrice(product)}</span></div>
          <span className="status">{product.status ?? "Statut non renseigné"}</span>
        </div>)}
      </div>}
    </div>
  );
}

function Reports({ stores, analytics }: { stores: StoreData[]; analytics: AnalyticsData }) {
  const [from, setFrom] = useState(analytics?.kpis.period.from ?? "");
  const [to, setTo] = useState(analytics?.kpis.period.to ?? "");
  const kpis = analytics?.kpis;
  const period = from && to ? `${formatReportDate(from)} – ${formatReportDate(to)}` : "Période sélectionnée";
  return <>
    <div className="page-top"><div><span className="eyebrow">Pilotage business</span><h1>Rapports</h1><p>Comprends ce qui s’est passé et décide de tes prochaines actions.</p></div></div>
    <div className="app-card report-filters" style={{ marginBottom: 18 }}>
      <div className="report-filter-title"><CalendarDays size={17} /><div><strong>Période du rapport</strong><span>Les données Chariow sont analysées au format jour.</span></div></div>
      <div className="report-filter-fields"><label>Du<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Au<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="btn btn-dark" disabled={!stores.length}>Actualiser</button></div>
    </div>
    {!analytics || !kpis ? <div className="empty-state">Aucune donnée pour cette période.</div> : <>
      <div className="report-period"><span>Rapport analysé</span><strong>{period}</strong></div>
      <div className="report-summary">
        <div className="report-summary-main"><span className="eyebrow">Performance commerciale</span><strong>{kpis.revenue.formatted ?? "0"}</strong><p>{kpis.sales === 0 ? "Aucune vente enregistrée pour cette période." : `${kpis.sales} vente${kpis.sales > 1 ? "s" : ""} enregistrée${kpis.sales > 1 ? "s" : ""}.`}</p></div>
        <div className="report-summary-side"><ReportStat icon={<ShoppingBag size={16} />} label="Ventes" value={kpis.sales} /><ReportStat icon={<Eye size={16} />} label="Visites" value={kpis.visits} /><ReportStat icon={<Users size={16} />} label="Clients" value={kpis.customers} /><ReportStat icon={<BarChart3 size={16} />} label="Conversion" value={kpis.conversionRate} /></div>
      </div>
      <div className="report-columns">
        <section className="app-card report-section"><div className="card-head"><div><span className="eyebrow">Inventaire et performance</span><h2>Détail des produits</h2></div><strong>{analytics.products.length} produit{analytics.products.length > 1 ? "s" : ""}</strong></div>{analytics.products.length === 0 ? <p className="report-muted">Aucun produit trouvé dans ton catalogue.</p> : <div className="report-table"><div className="report-table-head"><span>Produit</span><span>Statut</span><span>Ventes</span></div>{analytics.products.map((product) => <div className="report-table-row" key={product.id}><div className="report-product"><span className="report-product-icon">{product.image ? <img src={product.image} alt="" /> : <Package size={16} />}</span><span><strong>{product.name}</strong><small>{formatProductPrice(product)}</small></span></div><span className="report-status">{product.status ?? "Non renseigné"}</span><strong>{product.sales ?? 0}</strong></div>)}</div>}</section>
        <section className="app-card report-section"><div className="card-head"><div><span className="eyebrow">Lecture rapide</span><h2>À retenir</h2></div><Lightbulb size={18} color="#d28b3d" /></div><div className="report-insight"><strong>{kpis.sales === 0 ? "Pas encore de ventes" : "Ton activité commerciale"}</strong><p>{kpis.sales === 0 ? "Teste un partage ciblé de ton produit et observe les visites sur la prochaine période." : "Compare cette période à la précédente pour identifier les produits qui tirent ta croissance."}</p></div><div className="report-insight"><strong>{kpis.visits === 0 ? "Aucune visite enregistrée" : `${kpis.visits} visite${kpis.visits > 1 ? "s" : ""} observée${kpis.visits > 1 ? "s" : ""}`}</strong><p>{kpis.visits === 0 ? "Ta prochaine priorité est d’amener du trafic vers ta boutique." : `Le taux de conversion actuel est de ${kpis.conversionRate}.`}</p></div></section>
      </div>
    </>}
  </>;
}

function ReportStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return <div className="report-stat"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function formatReportDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

function formatProductPrice(product: ProductData) {
  if (product.price === null || product.price === "") return "Prix non renseigné";
  return `${product.price}${product.currency ? ` ${product.currency}` : ""}`;
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
