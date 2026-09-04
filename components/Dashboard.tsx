"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BarChart3, CreditCard, Plus, Settings, Store, MessageSquare, LayoutDashboard, Package, CalendarDays, Users, Eye, ShoppingBag, Lightbulb, Activity, AlertTriangle, Target, TrendingUp, WalletCards, Calculator, ShieldAlert, CheckCircle2, Clock3, Brain, LineChart, Rocket, Sparkles, LogOut, Megaphone, FileText, ImageIcon, Info, Trash2 } from "lucide-react";
import { FaFacebookF, FaInstagram, FaTiktok, FaWhatsapp, FaLinkedinIn, FaPinterestP } from "react-icons/fa6";
import { cleanAiText } from "@/lib/ai/format";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useSearchParams } from "next/navigation";
import { calculateProfitability, formatMoney, getProfitRecommendation, type ProfitabilityInputs, type ProfitabilityResult, type ProfitScenario } from "@/lib/profitability";
import { isAdPlatformAllowed, type AdPlatform, type PlanId } from "@/lib/plans";

const SESSION_STORAGE_PROMPT_KEY = "vendeo_ai_prompt";
const DASHBOARD_CACHE_KEY = "vendeo_dashboard_cache_v1";
const ADS_CACHE_KEY = "vendeo_ads_cache_v1";

// Petit cache en sessionStorage : permet d'afficher instantanément les dernières
// données connues au lieu d'un écran "Chargement…" à chaque changement de section,
// pendant qu'une version fraîche est récupérée silencieusement en arrière-plan.
function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage indisponible (navigation privée, quota plein…) — on ignore simplement.
  }
}

const bars = [32, 44, 39, 55, 48, 65, 57, 71, 64, 82, 74, 91, 79, 96];

function MetricHelp({ label, description }: { label: string; description: string }) {
  return <span className="metric-label">{label}<button type="button" className="metric-help" aria-label={`Explication : ${label}`} title={description} onClick={(event) => { event.preventDefault(); event.stopPropagation(); window.alert(description); }}>?</button></span>;
}

// Logo Google officiel (marque "G" multicolore) — utilisé tel quel par Google dans ses boutons de connexion.
function GoogleLogo() {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.8741 2.6836-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.4673-.8064 5.9564-2.1818l-2.9087-2.2581c-.8064.54-1.8377.8591-3.0477.8591-2.3446 0-4.3282-1.5831-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853" />
      <path d="M3.9641 10.71c-.18-.54-.2827-1.1168-.2827-1.71s.1027-1.17.2827-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.9641 10.71z" fill="#FBBC05" />
      <path d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.6555 3.5795 9 3.5795z" fill="#EA4335" />
    </svg>
  );
}

// Badges avec les vrais logos officiels de chaque canal publicitaire (react-icons/fa6 + marque Google).
function ChannelBadge({ id }: { id: AdPlatform }) {
  if (id === "facebook") {
    return (
      <span className="channel-badge channel-badge-duo" aria-label="Facebook et Instagram">
        <span className="channel-badge facebook"><FaFacebookF size={16} /></span>
        <span className="channel-badge instagram"><FaInstagram size={15} /></span>
      </span>
    );
  }
  if (id === "tiktok") return <span className="channel-badge tiktok" aria-label="TikTok"><FaTiktok size={16} /></span>;
  if (id === "whatsapp") return <span className="channel-badge whatsapp" aria-label="WhatsApp"><FaWhatsapp size={17} /></span>;
  if (id === "pinterest") return <span className="channel-badge pinterest" aria-label="Pinterest"><FaPinterestP size={16} /></span>;
  if (id === "linkedin") return <span className="channel-badge linkedin" aria-label="LinkedIn"><FaLinkedinIn size={16} /></span>;
  if (id === "google") return <span className="channel-badge google" aria-label="Google"><GoogleLogo /></span>;
  return null;
}

type StoreData = {
  id: string;
  slug?: string;
  platform: string;
  store_name: string;
  mcp_url: string | null;
  is_active: boolean;
  connection_status?: string;
  connection_error?: string | null;
  logo_url?: string | null;
  image?: string | null;
};

type SubscriptionData = {
  plan: "eco" | "starter" | "pro";
  messages_used_this_month: number;
  messages_limit: number;
  free_messages_used: number;
  free_messages_limit: number;
  status: string;
  trial_active?: boolean;
  current_period_start?: string;
  current_period_end?: string;
};

type ProductData = { id: string; name: string; description: string | null; price: number | string | null; currency: string | null; status: string | null; image: string | null; url?: string | null; createdAt: string | null; sales: number | null };
type AnalyticsData = {
  storeName: string;
  storeStatus: string;
  products: ProductData[];
  sales: unknown[];
  kpis: { period: { from: string | null; to: string | null }; revenue: { value: number | string | null; formatted: string | null }; sales: number; visits: number; conversionRate: string; customers: number; productsSold: number };
} | null;

function subscriptionLimitFromStores(stores: StoreData[]) {
  // The API remains the source of truth for enforcement. This fallback keeps
  // the visible counter useful before the subscription response is loaded.
  return stores.length > 1 ? 3 : 1;
}

export function Dashboard() {
  const [active, setActive] = useState("Vue d’ensemble");
  const [moreOpen, setMoreOpen] = useState(false);
  const searchParams = useSearchParams();
  const [stores, setStores] = useState<StoreData[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData>(null);
  const [userName, setUserName] = useState("créateur");
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const [promoteProduct, setPromoteProduct] = useState<ProductData | null>(null);
  const [campaignRefreshKey, setCampaignRefreshKey] = useState(0);

  const userFirstName = (userName || "créateur").trim().split(/\s+/)[0] ?? "créateur";
  const freeUsed = subscription?.free_messages_used ?? 0;
  const freeLimit = subscription?.free_messages_limit ?? 3;
  const used = subscription?.messages_used_this_month ?? 0;
  const limit = subscription?.messages_limit ?? 400;
  const isActivePlan = subscription?.status === "active" && subscription?.trial_active === false;
  const remainingAiThisMonth = isActivePlan ? Math.max(0, limit - used) : Math.max(0, freeLimit - freeUsed);

  const links = [
    ["Vue d’ensemble", LayoutDashboard],
    ["Vendeo AI", MessageSquare],
    ["Assistant de profit", WalletCards],
    ["Pubs", Megaphone],
    ["Mes boutiques", Store],
    ["Rapports", FileText],
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
      const cached = readCache<{ stores: StoreData[]; selectedStoreId: string | null; subscription: SubscriptionData | null; analytics: AnalyticsData }>(DASHBOARD_CACHE_KEY);
      if (cached && !cancelled) {
        // On affiche tout de suite les dernières données connues : plus d'écran
        // "Chargement de ton espace…" à chaque ouverture, la mise à jour se fait en silence.
        setStores(cached.stores);
        if (cached.selectedStoreId) setSelectedStoreId(cached.selectedStoreId);
        setSubscription(cached.subscription);
        setAnalytics(cached.analytics);
        setLoadingData(false);
      }

      const storeResponse = await fetch("/api/stores");
      const storeResult = storeResponse.ok ? await storeResponse.json() : { stores: [] };
      if (cancelled) return;
      const nextStores = storeResult.stores ?? [];
      setStores(nextStores);

      const nextSelected = selectedStoreId && nextStores.some((store: StoreData) => store.id === selectedStoreId)
        ? selectedStoreId
        : nextStores[0]?.id ?? null;
      if (nextSelected !== selectedStoreId) setSelectedStoreId(nextSelected);

      setLoadingData(false);

      const subscriptionPromise = fetch("/api/subscription").then((r) => (r.ok ? r.json() : { subscription: null }));
      const analyticsPromise = nextSelected
        ? fetch(`/api/analytics?store_id=${encodeURIComponent(nextSelected)}`).then((r) => (r.ok ? r.json() : null))
        : Promise.resolve(null);

      const [subscriptionResult, analyticsResult] = await Promise.all([subscriptionPromise, analyticsPromise]);
      if (cancelled) return;
      const nextSubscription = subscriptionResult.subscription ?? null;
      const nextAnalytics = analyticsResult?.snapshot ?? null;
      setSubscription(nextSubscription);
      setAnalytics(nextAnalytics);
      writeCache(DASHBOARD_CACHE_KEY, { stores: nextStores, selectedStoreId: nextSelected, subscription: nextSubscription, analytics: nextAnalytics });
    }

    loadDashboard().catch(() => {
      if (!cancelled) setLoadingData(false);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedStoreId) return;
    void (async () => {
      const res = await fetch(`/api/analytics?store_id=${encodeURIComponent(selectedStoreId)}`);
      const data = res.ok ? await res.json() : null;
      const nextAnalytics = data?.snapshot ?? null;
      setAnalytics(nextAnalytics);
      const cached = readCache<{ stores: StoreData[]; selectedStoreId: string | null; subscription: SubscriptionData | null; analytics: AnalyticsData }>(DASHBOARD_CACHE_KEY);
      writeCache(DASHBOARD_CACHE_KEY, { stores: cached?.stores ?? stores, selectedStoreId, subscription: cached?.subscription ?? subscription, analytics: nextAnalytics });
    })();
  }, [selectedStoreId]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <Link href="/" className="brand">
          <Image className="brand-logo" src="/vendeo-logo-light.svg" alt="Vendeo" width={150} height={40} />
        </Link>
        <div className="app-user">
          <span className="app-greeting">Bonjour, {userName}</span>
          <button type="button" className={`mobile-more-trigger ${moreOpen || ["Mes boutiques", "Abonnement", "Paramètres"].includes(active) ? "active" : ""}`} aria-label="Plus d'options" onClick={() => setMoreOpen((open) => !open)}>
            <Settings size={18} />
          </button>
          <button className="desktop-signout" onClick={signOut} style={{ background: "transparent", border: 0, color: "#c7d2fe", fontSize: 11 }}>
            Déconnexion
          </button>
        </div>
      </header>
      <div className="app-layout">
        <aside className="sidebar">
          <div className="side-label">Workspace</div>
          <label className="store-selector">
            <span>Boutique affichée</span>
            <select
              value={selectedStoreId ?? ""}
              disabled={!stores.length}
              onChange={(e) => setSelectedStoreId(e.target.value || null)}
            >
              {!stores.length && <option value="">Aucune boutique</option>}
              {stores.map((s) => <option key={s.id} value={s.id}>{s.store_name}</option>)}
            </select>
          </label>
          {links.map(([name, Icon]) => (
            <button key={name} className={`side-link ${active === name ? "active" : ""}`} onClick={() => setActive(name)}>
              <Icon size={16} />
              {name}
            </button>
          ))}
          <div className="side-label" style={{ marginTop: 28 }}>
            Compte
          </div>
          <button
            className="side-link"
            type="button"
            onClick={() => setSettingsNotice("Paramètres bientôt disponibles.")}
          >
            <Settings size={16} />Paramètres
          </button>

          {settingsNotice ? (
            <div className="side-notice" role="status" aria-live="polite">
              {settingsNotice}
              <button className="side-notice-close" type="button" onClick={() => setSettingsNotice(null)}>
                ×
              </button>
            </div>
          ) : null}
          <div style={{ background: "linear-gradient(135deg,#ede9fe,#e0f2fe)", borderRadius: 10, margin: "35px 4px 0", padding: 14 }}>
            <span className="eyebrow" style={{ fontSize: 9 }}>
              {isActivePlan ? `Plan ${subscription?.plan === "pro" ? "Pro" : "Starter"} actif` : subscription?.status === "past_due" ? "Abonnement expiré" : "Essai gratuit"}
            </span>
            {isActivePlan && subscription?.plan === "pro" ? <p style={{ fontSize: 11, lineHeight: 1.5, margin: "9px 0", color: "#334155" }}>Ton abonnement Pro est actif.</p> : <><p style={{ fontSize: 11, lineHeight: 1.5, margin: "9px 0", color: "#334155" }}>{isActivePlan ? "Passe au Pro pour débloquer les rapports." : subscription?.status === "past_due" ? "Ton abonnement a expiré. Choisis un plan pour continuer." : "Choisis un plan pour continuer après ton essai."}</p><button className="btn btn-dark" style={{ fontSize: 10, padding: "8px 10px", width: "100%" }} onClick={() => setActive("Abonnement")}>{isActivePlan ? "Passer au Pro" : "Voir les plans"}</button></>}
          </div>

          <div className="side-usage">
            <div className="side-usage-label">Usage IA ce mois</div>
            <div className="side-usage-value">{remainingAiThisMonth.toLocaleString("fr-FR")} messages disponibles</div>
          </div>
        </aside>
        <section className={active === "Vendeo AI" ? "app-main chat-page" : "app-main"}>
          {loadingData ? (
            <div className="app-card">Chargement de ton espace…</div>
          ) : stores.length === 0 && active !== "Mes boutiques" && active !== "Paramètres" && active !== "Abonnement" ? (
            <StoreOnboarding />
          ) : active === "Paramètres" ? (
            <MobileSettingsView onNavigate={setActive} onSignOut={signOut} />
          ) : active === "Vendeo AI" ? (
            <ChatView
              onGoToSubscription={() => setActive("Abonnement")}
              onUsageChange={(patch) =>
                setSubscription((prev) => (prev ? { ...prev, ...patch } : prev))
              }
            />
          ) : active === "Assistant de profit" ? (
            <ProfitAssistant analytics={analytics} />
          ) : active === "Pubs" ? (
             <AdsView products={analytics?.products ?? []} plan={(subscription?.plan ?? "starter") as PlanId} onPromoteProduct={setPromoteProduct} campaignRefreshKey={campaignRefreshKey} />
          ) : active === "Mes boutiques" ? (
            <StoresView stores={stores} onStoresChange={setStores} onBackToSettings={() => setActive("Paramètres")} />
          ) : active === "Abonnement" ? (
            <SubscriptionView subscription={subscription} onBackToSettings={() => setActive("Paramètres")} />
          ) : active === "Rapports" ? (
            <Reports stores={stores} analytics={analytics} />
          ) : (
            <Overview
              stores={stores}
              subscription={subscription}
              analytics={analytics}
              userFirstName={userFirstName}
              onGoToAI={() => setActive("Vendeo AI")}
              selectedStoreId={selectedStoreId}
              onStoreChange={setSelectedStoreId}
            />
          )}
         </section>
      </div>

      {promoteProduct ? <CampaignWizard product={promoteProduct} plan={(subscription?.plan ?? "starter") as PlanId} onClose={() => setPromoteProduct(null)} onSaved={() => setCampaignRefreshKey((key) => key + 1)} /> : null}

        <nav className="mobile-nav" aria-label="Navigation mobile">
         <button type="button" className={`nav-btn ${active === "Vue d’ensemble" ? "active" : ""}`} onClick={() => setActive("Vue d’ensemble")}>
           <LayoutDashboard size={18} />
           <span>Accueil</span>
         </button>
          <button type="button" className={`nav-btn ${active === "Pubs" ? "active" : ""}`} onClick={() => setActive("Pubs")}>
            <Megaphone size={18} />
            <span>Pubs</span>
          </button>
           <button type="button" className={`nav-btn ${active === "Assistant de profit" ? "active" : ""}`} onClick={() => setActive("Assistant de profit")}>
             <WalletCards size={18} />
             <span>Profit</span>
          </button>
          <button type="button" className={`nav-btn ${active === "Vendeo AI" ? "active" : ""}`} onClick={() => setActive("Vendeo AI")}>
            <MessageSquare size={18} />
            <span>IA</span>
          </button>
          <button type="button" className={`nav-btn ${active === "Rapports" ? "active" : ""}`} onClick={() => setActive("Rapports")}>
            <FileText size={18} />
            <span>Rapports</span>
          </button>
        </nav>
        {moreOpen ? <div className="mobile-more-menu" role="menu">
          <button type="button" onClick={() => { setActive("Mes boutiques"); setMoreOpen(false); }}><Store size={16} /> Boutiques Chariow</button>
          <button type="button" onClick={() => { setActive("Abonnement"); setMoreOpen(false); }}><CreditCard size={16} /> Abonnement</button>
          <button type="button" onClick={() => { setActive("Paramètres"); setMoreOpen(false); }}><Settings size={16} /> Paramètres</button>
        </div> : null}
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

function Overview({
  stores,
  subscription,
  analytics,
  userFirstName,
  onGoToAI,
  selectedStoreId,
  onStoreChange,
}: {
  stores: StoreData[];
  subscription: SubscriptionData | null;
  analytics: AnalyticsData;
  userFirstName: string;
  onGoToAI: () => void;
  selectedStoreId: string | null;
  onStoreChange: (storeId: string) => void;
}) {
  const greeting = (userFirstName || "créateur").trim().split(/\s+/)[0] || "créateur";
  const store = stores[0];
  const connected = store?.connection_status === "connected";
  const products = analytics?.products ?? [];
  const sales = analytics?.kpis.sales ?? 0;
  const revenue = Number(analytics?.kpis.revenue.value ?? 0) || 0;
  const currency = products[0]?.currency ?? "XOF";
  const format = (value: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + ` ${currency}`;
  const [period, setPeriod] = useState("30 derniers jours");
  const [refreshing, setRefreshing] = useState(false);
  const [metaConnected, setMetaConnected] = useState(false);
  const [metaPerformance, setMetaPerformance] = useState<MetaPerformance | null>(null);
  const [costsConfigured] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const refresh = async () => { setRefreshing(true); try { const response = await fetch("/api/integrations/meta/accounts"); setMetaConnected(response.ok && ((await response.json()).accounts ?? []).length > 0); } finally { setRefreshing(false); } };
  useEffect(() => { void refresh(); }, []);
  const spend = metaPerformance?.overview.spend ?? 0;
  const roas = metaPerformance?.overview.metaRoas ?? null;
  const statusText = !connected ? "Connecte ta boutique Chariow pour commencer l’analyse." : !metaConnected ? "Ta boutique est connectée. Connecte Meta Ads pour relier tes dépenses à tes ventes." : sales === 0 && spend > 0 ? "Les dépenses Meta ne produisent pas encore de vente confirmée." : sales === 0 ? "Aucune vente confirmée sur la période. Commence par observer ton trafic et tes campagnes." : "Ton activité est suivie. Analyse les campagnes et les produits qui contribuent le plus à tes ventes.";
  const productsSummary = products.slice(0, 5).map((product) => ({ name: product.name, sales: product.sales ?? 0, revenue: product.sales ? Number(product.price ?? 0) * product.sales : 0, state: product.sales ? "Performant" : "À surveiller" }));
  const openAI = (prompt: string) => { sessionStorage.setItem(SESSION_STORAGE_PROMPT_KEY, prompt); onGoToAI(); };
  return <div className="dashboard-home">
    <div className="home-greeting"><h1>Bonjour, {greeting}</h1></div>
    <div className="home-header"><div className="home-context"><span className="eyebrow">Vue d’ensemble</span><p>Une lecture claire de tes ventes, campagnes et prochaines décisions.</p></div><div className="home-controls"><label className="home-store-selector"><span>Boutique analysée</span><select aria-label="Boutique analysée" value={selectedStoreId ?? ""} disabled={!stores.length} onChange={(event) => onStoreChange(event.target.value)}>{!stores.length && <option value="">Aucune boutique</option>}{stores.map((item) => <option key={item.id} value={item.id}>{item.store_name}</option>)}</select></label><div className="home-statuses"><span className={connected ? "status-positive" : "status-warning"}>{connected ? "Chariow connectée" : "Chariow non connectée"}</span><span className={metaConnected ? "status-positive" : "status-info"}>{metaConnected ? "Meta Ads connectée" : "Meta Ads non connectée"}</span></div><span className="sync-label">Dernière synchronisation : à vérifier</span><div className="home-period"><span>Période</span><select aria-label="Période" value={period} onChange={(event) => setPeriod(event.target.value)}><option>Aujourd’hui</option><option>Hier</option><option>7 derniers jours</option><option>30 derniers jours</option><option>Ce mois-ci</option><option>Mois dernier</option><option>Personnalisé</option></select></div>{period === "Personnalisé" ? <><input aria-label="Date de début" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /><input aria-label="Date de fin" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></> : null}<button className="btn btn-ghost" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Actualisation…" : "Actualiser"}</button></div></div>
    <section className="home-ai-state app-card"><div><span className="eyebrow">Analyse IA</span><h2>État de votre activité</h2><p>{statusText}</p></div><Brain size={24} /></section>
    <section className="home-kpis"><HomeKpi label="Chiffre d’affaires Chariow" value={connected ? format(revenue) : "Non disponible"} tone={revenue > 0 ? "positive" : "neutral"} help="Revenu commercial remonté par Chariow." /><HomeKpi label="Ventes confirmées Chariow" value={connected ? String(sales) : "Non disponible"} tone={sales > 0 ? "positive" : "neutral"} help="Paiements confirmés par Chariow." /><HomeKpi label="Dépenses Meta Ads" value={metaConnected ? format(spend) : "Non disponible"} tone="info" help="Dépenses synchronisées depuis Meta Insights." /><HomeKpi label="Profit estimé" value={costsConfigured ? format(revenue - spend) : "Profit à configurer"} tone={costsConfigured ? "positive" : "warning"} help="Disponible après configuration des coûts produits." action={!costsConfigured ? () => window.dispatchEvent(new CustomEvent("vendeo:navigate", { detail: "Assistant de profit" })) : undefined} /><HomeKpi label="ROAS Meta rapporté" value={roas === null ? "Non disponible" : `${roas.toFixed(2)}x`} tone={roas !== null && roas >= 1 ? "positive" : "info"} help="Valeur d’achat rapportée par Meta divisée par les dépenses Meta." /></section>
     <div className="home-primary-grid"><section className="home-chart app-card"><div className="card-head"><div><span className="eyebrow">Tendance</span><h2>Évolution du chiffre d’affaires et des dépenses</h2><p>Compare les résultats commerciaux aux dépenses publicitaires.</p></div><LineChart size={19} /></div>{!connected && !metaConnected ? <EmptyState title="Données indisponibles" text="Connecte Chariow et Meta Ads pour afficher l’évolution." /> : <RealTrendChart sales={analytics?.sales ?? []} spend={spend} currency={currency} />}</section><section className="home-actions app-card"><div className="card-head"><div><span className="eyebrow">Décision</span><h2>À faire maintenant</h2><p>Les deux actions les plus utiles pour avancer.</p></div><Target size={19} /></div><div className="action-list"><ActionItem title={!metaConnected ? "Connecter Meta Ads" : spend > 0 && sales === 0 ? "Surveiller les dépenses sans vente" : "Analyser les campagnes performantes"} proof={!metaConnected ? "Les dépenses publicitaires ne sont pas encore disponibles." : `${format(spend)} dépensés pour ${sales} vente(s) confirmée(s).`} action={!metaConnected ? "Pubs" : "Pubs"} onClick={() => openAI("Analyse mes priorités publicitaires à partir des données disponibles.")} /><ActionItem title={!connected ? "Connecter Chariow" : sales === 0 ? "Vérifier la conversion de la boutique" : "Identifier le produit moteur"} proof={connected ? `${sales} vente(s) confirmée(s) sur la période.` : "Aucune donnée Chariow disponible."} action="Boutiques Chariow" onClick={() => openAI("Analyse ce qui fonctionne et ce qui bloque ma conversion.")} /></div></section></div>
     <div className="home-tables"><SummaryTable title="Produits les plus performants" columns={["Produit", "Ventes", "CA", "État"]} rows={productsSummary.map((product) => [product.name, product.sales, format(product.revenue), product.state])} empty="Aucune vente produit disponible." /><SummaryTable title="Campagnes Meta Ads" columns={["Campagne", "Dépenses", "Clics", "ROAS Meta rapporté", "État"]} rows={(metaPerformance?.performances ?? []).slice(0, 5).map((campaign) => [campaign.name, format(campaign.spend), campaign.clicks, campaign.roas === null ? "Non disponible" : `${campaign.roas.toFixed(2)}x`, campaign.status])} empty={metaConnected ? "Aucune campagne avec données sur la période." : "Meta Ads non connectée."} /></div>
     <section className="home-activity app-card"><div className="card-head"><div><span className="eyebrow">Chariow</span><h2>Activité récente</h2><p>Les derniers événements remontés par ta boutique.</p></div><Activity size={19} /></div>{analytics?.sales?.length ? <ul className="activity">{analytics.sales.slice(0, 5).map((sale, index) => <RecentSale key={index} sale={sale} currency={currency} />)}</ul> : <EmptyState title="Aucune vente récente" text="Les ventes et statuts Chariow apparaîtront ici lorsqu’ils seront synchronisés." />}</section>
  </div>;
}

function HomeKpi({ label, value, help, tone, action }: { label: string; value: string; help: string; tone: string; action?: () => void }) { return <div className={`home-kpi ${tone}`}><small>{label}</small><strong>{value}</strong><span>{help}</span>{action ? <button className="btn btn-ghost" onClick={action}>Configurer</button> : null}</div>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="home-empty"><strong>{title}</strong><span>{text}</span></div>; }
function ActionItem({ title, proof, action, onClick }: { title: string; proof: string; action: string; onClick: () => void }) { return <div className="home-action-item"><div><strong>{title}</strong><p>{proof}</p></div><button className="btn btn-dark" onClick={onClick}>{action}</button></div>; }
function SummaryTable({ title, columns, rows, empty }: { title: string; columns: string[]; rows: Array<Array<string | number>>; empty: string }) { return <section className="home-summary app-card"><div className="card-head"><h2>{title}</h2><BarChart3 size={18} /></div>{rows.length ? <div className="home-table"><div className="home-table-row home-table-head">{columns.map((column) => <span key={column}>{column}</span>)}</div>{rows.map((row, index) => <div className="home-table-row" key={index}>{row.map((value, valueIndex) => <span key={valueIndex}>{value}</span>)}</div>)}</div> : <EmptyState title={empty} text="Les données apparaîtront après synchronisation." />}</section>; }

function SalesView({ stores, analytics }: { stores: StoreData[]; analytics: AnalyticsData }) {
  const [filter, setFilter] = useState("all");
  const sales = (analytics?.sales ?? []).filter((sale) => filter === "all" || String((sale as Record<string, unknown>)?.status ?? "") === filter);
  const completed = sales.filter((sale) => String((sale as Record<string, unknown>)?.status) === "completed");
  const revenue = completed.reduce<number>((sum, sale) => sum + Number(((sale as Record<string, unknown>)?.amount as Record<string, unknown>)?.value ?? (sale as Record<string, unknown>)?.amount ?? 0), 0);
  return <div className="sales-page"><div className="page-top"><div><span className="eyebrow">Chariow</span><h1>Ventes</h1><p>Suivi des événements et revenus remontés par ta boutique.</p></div></div><div className="sales-kpis"><HomeKpi label="Ventes confirmées" value={String(completed.length)} tone="positive" help="Paiements validés par Chariow." /><HomeKpi label="Revenu brut" value={revenue ? `${revenue.toLocaleString("fr-FR")} ${analytics?.products?.[0]?.currency ?? "XOF"}` : "0"} tone="info" help="Montant des ventes confirmées." /><HomeKpi label="Événements suivis" value={String(sales.length)} tone="neutral" help="Ventes et statuts remontés." /></div><div className="sales-toolbar"><label>Statut<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">Tous</option><option value="completed">Réussies</option><option value="awaiting_payment">En attente</option><option value="failed">Échouées</option><option value="abandoned">Abandonnées</option><option value="refunded">Remboursées</option></select></label></div><section className="app-card sales-list"><div className="card-head"><h2>Activité Chariow</h2><Activity size={18} /></div>{sales.length ? <ul className="activity">{sales.map((sale, index) => <RecentSale key={index} sale={sale} currency={analytics?.products?.[0]?.currency ?? "XOF"} />)}</ul> : <EmptyState title="Aucun événement" text="Les événements Chariow apparaîtront après synchronisation." />}</section></div>;
}

function RealTrendChart({ sales, spend, currency }: { sales: unknown[]; spend: number; currency: string }) {
  const rows = sales.map((item) => item && typeof item === "object" ? item as Record<string, unknown> : {}).filter((item) => (item.status === "completed" || item.status === "settled") && (item.created_at || item.createdAt || item.occurred_at));
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (6 - index)); return date.toISOString().slice(0, 10); });
  const values = days.map((day) => rows.filter((row) => String(row.created_at ?? row.createdAt ?? row.occurred_at).slice(0, 10) === day).reduce<number>((sum, row) => sum + Number((row.amount as Record<string, unknown>)?.value ?? row.amount ?? 0), 0));
  const max = Math.max(...values, spend, 1);
  const points = values.map((value, index) => `${index * 100 / 6},${100 - value / max * 78}`).join(" ");
  return <div className="real-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Evolution réelle du chiffre d’affaires Chariow"><line x1="0" y1="90" x2="100" y2="90" /><polyline points={points} /></svg><div className="chart-legend"><span><i className="legend-dot revenue-dot" /> CA Chariow</span><span className="chart-total">Total : {new Intl.NumberFormat("fr-FR").format(values.reduce((sum, value) => sum + value, 0))} {currency}</span></div></div>;
}

function displayValue(value: unknown, keys: string[] = ["name", "label", "title", "value", "text", "code"]): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => displayValue(item)).filter(Boolean).join(", ") || undefined;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of keys) {
      const result = displayValue(object[key]);
      if (result) return result;
    }
    return Object.values(object).map((item) => displayValue(item)).filter(Boolean).join(" · ") || undefined;
  }
  return undefined;
}

function displayPhone(value: unknown) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  const number = displayValue(object.number ?? object.phone_number ?? object.value ?? object.formatted);
  const code = displayValue(object.country_code ?? object.dial_code ?? object.countryCode);
  return [code, number].filter(Boolean).join(" ") || displayValue(value);
}

function RecentSale({ sale, currency }: { sale: unknown; currency: string }) {
  const [open, setOpen] = useState(false);
  const row = sale && typeof sale === "object" ? sale as Record<string, unknown> : {};
  const status = String(row.status ?? row.state ?? "unknown");
  const label = status === "completed" ? "Vente réussie" : status === "awaiting_payment" ? "Paiement en attente" : status === "failed" ? "Paiement échoué" : status === "abandoned" ? "Vente abandonnée" : status === "refunded" ? "Remboursement" : status;
  const amount = Number((row.amount as Record<string, unknown>)?.value ?? row.amount ?? 0);
  const date = row.created_at ?? row.createdAt ?? row.occurred_at;
  const customer = (row.customer as Record<string, unknown> | undefined) ?? {};
  const error = (row.error as Record<string, unknown> | undefined) ?? {};
  const payment = (row.payment as Record<string, unknown> | undefined) ?? {};
  const context = (row.context as Record<string, unknown> | undefined) ?? {};
  const phone = displayPhone(customer.phone ?? row.phone ?? customer.phone_number ?? row.phone_number);
  const price = row.price ?? payment.price ?? row.amount;
  const discount = row.discount ?? payment.discount ?? row.discount_amount;
  const netAmount = row.net_amount ?? row.netAmount ?? payment.net_amount ?? payment.netAmount ?? row.amount;
  const source = displayValue(row.source ?? payment.source) ?? "Non fourni";
  const shop = displayValue(row.store_name ?? row.store ?? row.shop) ?? "Non fourni";
  const description = displayValue(row.description ?? row.sale_description) ?? "Non fournie";
  const country = displayValue(row.country ?? context.country ?? customer.country) ?? "Non fourni";
  const language = displayValue(row.language ?? context.language ?? customer.language) ?? "Non fournie";
  const device = displayValue(row.device ?? context.device) ?? "Non fourni";
  const productName = String(row.product_name ?? (row.product as Record<string, unknown>)?.name ?? "Produit Chariow");
  const customerName = customer.name ?? ([customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Non fourni");
  const failureReason = displayValue(error.message ?? error.description ?? row.failure_reason ?? row.failureReason ?? row.error_message ?? row.reason ?? row.status_reason ?? row.payment_error ?? row.failure ?? row.payment_status_reason ?? (row.payment as Record<string, unknown> | undefined)?.error) ?? "Non fournie par Chariow";
  const money = (value: unknown) => { const numeric = Number((value as Record<string, unknown>)?.value ?? value); return Number.isFinite(numeric) && numeric > 0 ? `${numeric.toLocaleString("fr-FR")} ${String((value as Record<string, unknown>)?.currency ?? currency)}` : "Non fourni"; };
  return <><li><i className={`activity-dot activity-${status}`} /><span><b>{label}</b><br />{productName} · {amount ? `${amount.toLocaleString("fr-FR")} ${currency}` : "Montant indisponible"} · {date ? new Date(String(date)).toLocaleDateString("fr-FR") : "Date indisponible"}</span><button type="button" className="activity-detail" onClick={() => setOpen(true)}>Détail</button></li>{open ? <div className="sale-modal-backdrop" role="presentation" onClick={() => setOpen(false)}><section className="sale-modal sale-modal-wide" role="dialog" aria-modal="true" aria-labelledby="sale-detail-title" onClick={(event) => event.stopPropagation()}><button type="button" className="sale-modal-close" aria-label="Fermer" onClick={() => setOpen(false)}>×</button><span className="eyebrow">Détail Chariow</span><h2 id="sale-detail-title">{label}</h2><h3 className="sale-modal-section-title">Client</h3><div className="sale-detail-grid"><div><small>Nom</small><strong>{String(customerName)}</strong></div><div><small>Email</small><strong>{String(customer.email ?? row.email ?? "Non fourni")}</strong></div><div><small>Téléphone</small><strong>{String(phone ?? "Non fourni")}</strong></div></div><h3 className="sale-modal-section-title">Informations de paiement</h3><div className="sale-detail-grid"><div><small>Prix</small><strong>{money(price)}</strong></div><div><small>Réduction</small><strong>{money(discount)}</strong></div><div><small>Montant net</small><strong>{money(netAmount)}</strong></div><div><small>Source</small><strong>{String(source)}</strong></div><div><small>Boutique</small><strong>{String(shop)}</strong></div><div><small>Description</small><strong>{String(description)}</strong></div></div><h3 className="sale-modal-section-title">Contexte</h3><div className="sale-detail-grid"><div><small>Pays</small><strong>{String(country)}</strong></div><div><small>Langue</small><strong>{String(language)}</strong></div><div><small>Appareil</small><strong>{String(device)}</strong></div><div><small>Date</small><strong>{date ? new Date(String(date)).toLocaleString("fr-FR") : "Non fournie"}</strong></div><div><small>Raison de l’échec</small><strong>{status === "failed" ? String(failureReason) : "Aucune"}</strong></div></div><button type="button" className="btn btn-dark sale-modal-action" onClick={() => setOpen(false)}>Fermer</button></section></div> : null}</>;
}

function BusinessSignals({ analytics, health }: { analytics: AnalyticsData; health: StoreHealth }) {
  if (!analytics) return null;
  const { kpis, products } = analytics;
  const alerts = getBusinessAlerts(analytics);
  const recommendation = getRecommendation(analytics);
  return <div className="business-signals">
    <div className="signal-health app-card">
      <div className="card-head"><div><span className="eyebrow">Lecture Vendeo</span><h2>Score de santé</h2></div><Activity size={18} color="#34684d" /></div>
      <div className="health-score"><strong>{health.score}</strong><span>/ 100</span></div>
      <p>{health.label}</p>
      <div className="health-progress"><i style={{ width: `${health.score}%` }} /></div>
      <small>{health.details}</small>
    </div>
    <div className="signal-alerts app-card">
      <div className="card-head"><div><span className="eyebrow">À surveiller</span><h2>Signaux utiles</h2></div><AlertTriangle size={18} color="#d28b3d" /></div>
      {alerts.length ? <div className="signal-list">{alerts.map((alert) => <div className={`signal-item ${alert.tone}`} key={alert.title}><span>{alert.icon}</span><div><strong>{alert.title}</strong><p>{alert.description}</p></div></div>)}</div> : <div className="signal-item positive"><span><TrendingUp size={15} /></span><div><strong>Tout est stable</strong><p>Aucun signal critique n’a été détecté sur cette période.</p></div></div>}
      <PersistentAlerts />
    </div>
    <div className="signal-action app-card"><div className="card-head"><div><span className="eyebrow">Prochaine action</span><h2>Ton meilleur levier</h2></div><Target size={18} color="#34684d" /></div><strong>{recommendation.title}</strong><p>{recommendation.description}</p><div className="signal-meta">{products.length} produit{products.length > 1 ? "s" : ""} · {kpis.sales} vente{kpis.sales > 1 ? "s" : ""} · {kpis.visits} visite{kpis.visits > 1 ? "s" : ""}</div></div>
  </div>;
}

function PersistentAlerts() {
  const [alerts, setAlerts] = useState<Array<{ id: string; severity: string; title: string; description: string; status: string }>>([]);
  useEffect(() => { void fetch("/api/alerts").then((response) => response.ok ? response.json() : { alerts: [] }).then((data) => setAlerts(data.alerts ?? [])); }, []);
  if (!alerts.length) return null;
  return <div className="signal-list" style={{ marginTop: 12 }}>{alerts.slice(0, 3).map((alert) => <div className={`signal-item ${alert.severity}`} key={alert.id}><span><AlertTriangle size={15} /></span><div><strong>{alert.title}</strong><p>{alert.description}</p></div></div>)}</div>;
}

type StoreHealth = { score: number; label: string; details: string };

function getStoreHealth(analytics: AnalyticsData): StoreHealth {
  if (!analytics) return { score: 0, label: "Données indisponibles", details: "Reconnecte ta boutique pour recalculer le score." };
  const { kpis, products } = analytics;
  let score = 35;
  if (products.length > 0) score += 20;
  if (kpis.visits > 0) score += 15;
  if (kpis.sales > 0) score += 20;
  if (kpis.customers > 0) score += 5;
  if (kpis.conversionRate !== "0 %") score += 5;
  const bounded = Math.min(score, 100);
  return { score: bounded, label: bounded >= 75 ? "Ta boutique est en bonne dynamique." : bounded >= 50 ? "Ta boutique a une base solide à développer." : "Ta priorité est de générer du trafic et des premières ventes.", details: `${products.length} produit${products.length > 1 ? "s" : ""} au catalogue, ${kpis.visits} visite${kpis.visits > 1 ? "s" : ""} et ${kpis.sales} vente${kpis.sales > 1 ? "s" : ""} sur la période.` };
}

function getBusinessAlerts(analytics: AnalyticsData) {
  if (!analytics) return [];
  const { kpis, products } = analytics;
  const alerts: { title: string; description: string; tone: string; icon: React.ReactNode }[] = [];
  if (!products.length) alerts.push({ title: "Ton catalogue est vide", description: "Ajoute un produit pour commencer à mesurer ta boutique.", tone: "warning", icon: <Package size={15} /> });
  if (kpis.visits > 0 && kpis.sales === 0) alerts.push({ title: "Trafic sans vente", description: "Tes visiteurs ne convertissent pas encore. Travaille l’offre ou la page de vente.", tone: "warning", icon: <Eye size={15} /> });
  if (kpis.visits === 0) alerts.push({ title: "Aucune visite enregistrée", description: "Partage ta boutique auprès d’une audience ciblée pour créer tes premiers signaux.", tone: "neutral", icon: <Eye size={15} /> });
  if (kpis.sales === 0 && kpis.customers === 0) alerts.push({ title: "Pas encore de clients", description: "Commence par promouvoir ton produit principal avec un message clair et une offre simple.", tone: "neutral", icon: <Users size={15} /> });
  return alerts.slice(0, 3);
}

function getRecommendation(analytics: AnalyticsData) {
  if (!analytics) return { title: "Reconnecter ta boutique", description: "Les données sont nécessaires pour proposer une action utile." };
  const { kpis, products } = analytics;
  if (!products.length) return { title: "Ajouter ton premier produit", description: "Sans produit dans le catalogue, Vendeo ne peut pas identifier ton meilleur levier commercial." };
  if (kpis.visits === 0) return { title: "Créer du trafic qualifié", description: "Partage ton produit auprès d’une audience précise et suis les visites sur la prochaine période." };
  if (kpis.sales === 0) return { title: "Améliorer la conversion", description: "Tes prochaines actions doivent rassurer les visiteurs : bénéfice clair, preuve sociale et appel à l’action visible." };
  return { title: "Capitaliser sur tes ventes", description: "Analyse ton produit principal et teste une offre complémentaire pour augmenter la valeur de chaque client." };
}

function ProductCatalog({ products, onPromote }: { products: ProductData[]; onPromote?: (product: ProductData) => void }) {
  return (
    <div className="app-card" style={{ marginTop: 18 }}>
      <div className="card-head"><div><h2>Ton catalogue</h2><p>{products.length ? "Les produits récupérés depuis ta boutique Chariow." : "Aucun produit n’a été trouvé dans ta boutique Chariow."}</p></div></div>
      {products.length > 0 && <div style={{ display: "grid", gap: 10, marginTop: 15 }}>
        {products.map((product) => <div key={product.id} className="store-row">
          <div className="store-logo">{product.image ? <img src={product.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} /> : <Package size={18} />}</div>
          <div className="store-info"><strong>{product.name}</strong><span>{formatProductPrice(product)}</span></div>
           <span className="status">{product.status ?? "Statut non renseigné"}</span>
           {onPromote ? <button className="btn btn-dark" type="button" onClick={() => onPromote(product)}>Promouvoir</button> : null}
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
        <section className="app-card report-section"><div className="card-head"><div><span className="eyebrow">Inventaire et performance</span><h2>Détail des produits</h2></div><strong>{analytics.products.length} produit{analytics.products.length > 1 ? "s" : ""}</strong></div>{analytics.products.length === 0 ? <p className="report-muted">Aucun produit trouvé dans ton catalogue.</p> : <div className="report-table"><div className="report-table-head"><span>Produit</span><span>Statut</span><span>Ventes</span></div>{analytics.products.map((product) => <div className="report-table-row" key={product.id}><div className="report-product"><span className="report-product-icon">{product.image ? <img src={product.image} alt="" /> : <Package size={16} />}</span><span><strong title={product.name}>{product.name}</strong><small>{formatProductPrice(product)}</small></span></div><span className="report-status">{product.status ?? "Non renseigné"}</span><strong>{product.sales ?? 0}</strong></div>)}</div>}</section>
        <section className="app-card report-section"><div className="card-head"><div><span className="eyebrow">Lecture rapide</span><h2>À retenir</h2></div><Lightbulb size={18} color="#d28b3d" /></div><div className="report-insight"><strong>{kpis.sales === 0 ? "Pas encore de ventes" : "Ton activité commerciale"}</strong><p>{kpis.sales === 0 ? "Teste un partage ciblé de ton produit et observe les visites sur la prochaine période." : "Compare cette période à la précédente pour identifier les produits qui tirent ta croissance."}</p></div><div className="report-insight"><strong>{kpis.visits === 0 ? "Aucune visite enregistrée" : `${kpis.visits} visite${kpis.visits > 1 ? "s" : ""} observée${kpis.visits > 1 ? "s" : ""}`}</strong><p>{kpis.visits === 0 ? "Ta prochaine priorité est d’amener du trafic vers ta boutique." : `Le taux de conversion actuel est de ${kpis.conversionRate}.`}</p></div></section>
      </div>
      <div className="app-card report-conclusion"><div className="card-head"><div><span className="eyebrow">Conclusion Vendeo</span><h2>Ce que tu dois retenir</h2></div><Target size={18} color="#34684d" /></div><div className="conclusion-grid"><div><small>Ce qui s’est passé</small><strong>{kpis.sales === 0 && kpis.visits === 0 ? "La période est encore calme." : `${kpis.sales} vente${kpis.sales > 1 ? "s" : ""} pour ${kpis.visits} visite${kpis.visits > 1 ? "s" : ""}.`}</strong></div><div><small>Pourquoi c’est important</small><strong>{kpis.visits === 0 ? "Sans trafic, aucune conversion n’est possible." : kpis.sales === 0 ? "Le prochain enjeu est de convertir tes visiteurs." : `La conversion actuelle est de ${kpis.conversionRate}.`}</strong></div><div><small>Prochaine action</small><strong>{getRecommendation(analytics).title}</strong></div></div></div>
    </>}
  </>;
}

function MobileSettingsView({ onNavigate, onSignOut }: { onNavigate: (section: string) => void; onSignOut: () => void }) {
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  async function deleteAccount() {
    setDeletingAccount(true); setAccountMessage(null);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAccountMessage(data.error ?? "Impossible de supprimer le compte.");
        return;
      }
      window.location.href = "/?account=deleted";
    } catch {
      setAccountMessage("Impossible de supprimer le compte.");
    } finally {
      setDeletingAccount(false);
    }
  }
  return (
    <>
      <div className="page-top">
        <div>
          <span className="eyebrow">Compte</span>
          <h1>Paramètres</h1>
          <p>Gère tes boutiques et ton abonnement depuis cet espace.</p>
        </div>
      </div>
      <div className="mobile-settings-grid">
        <button type="button" className="mobile-settings-card" onClick={() => onNavigate("Pubs")}>
          <span className="mobile-settings-icon"><Megaphone size={20} /></span>
          <span><strong>Pubs</strong><small>Connecter Meta, TikTok et gérer tes campagnes publicitaires.</small></span>
          <ArrowRight size={16} />
        </button>
        <button type="button" className="mobile-settings-card" onClick={() => onNavigate("Mes boutiques")}>
          <span className="mobile-settings-icon"><Store size={20} /></span>
          <span><strong>Mes boutiques</strong><small>Connecter et gérer tes boutiques Chariow.</small></span>
          <ArrowRight size={16} />
        </button>
        <button type="button" className="mobile-settings-card" onClick={() => onNavigate("Abonnement")}>
          <span className="mobile-settings-icon"><CreditCard size={20} /></span>
          <span><strong>Abonnement</strong><small>Voir ton plan et gérer ton accès Vendeo.</small></span>
          <ArrowRight size={16} />
        </button>
         <button type="button" className="mobile-settings-card mobile-settings-danger" onClick={onSignOut}>
          <span className="mobile-settings-icon"><LogOut size={20} /></span>
          <span><strong>Déconnexion</strong><small>Quitter ton espace Vendeo en toute sécurité.</small></span>
           <ArrowRight size={16} />
         </button>
         {accountMessage ? <p className="settings-inline-message settings-account-error" role="alert">{accountMessage}</p> : null}
         <button type="button" className="mobile-settings-card mobile-settings-danger settings-delete-account" onClick={() => setShowDeleteAccountModal(true)} disabled={deletingAccount}>
           <span className="mobile-settings-icon"><Trash2 size={20} /></span>
           <span><strong>{deletingAccount ? "Suppression du compte…" : "Supprimer mon compte"}</strong><small>Supprimer définitivement ton compte et toutes tes données.</small></span>
           <ArrowRight size={16} />
         </button>
      </div>
      {showDeleteAccountModal ? <div className="account-delete-backdrop" role="presentation" onClick={() => !deletingAccount && setShowDeleteAccountModal(false)}><section className="account-delete-modal" role="dialog" aria-modal="true" aria-labelledby="account-delete-title" onClick={(event) => event.stopPropagation()}><button type="button" className="account-delete-close" aria-label="Fermer" onClick={() => setShowDeleteAccountModal(false)} disabled={deletingAccount}>×</button><div className="account-delete-icon"><Trash2 size={22} /></div><span className="eyebrow">Action irréversible</span><h2 id="account-delete-title">Supprimer ton compte ?</h2><p>Ton profil, tes boutiques, tes conversations et tes connexions publicitaires seront définitivement supprimés.</p><div className="account-delete-warning">Cette action ne peut pas être annulée.</div><div className="account-delete-actions"><button type="button" className="btn btn-ghost" onClick={() => setShowDeleteAccountModal(false)} disabled={deletingAccount}>Annuler</button><button type="button" className="btn account-delete-confirm" onClick={() => void deleteAccount()} disabled={deletingAccount}>{deletingAccount ? "Suppression…" : "Oui, supprimer"}</button></div></section></div> : null}
    </>
  );
}

function ProfitAssistant({ analytics }: { analytics: AnalyticsData }) {
  const product = analytics?.products?.[0];
  const price = product?.price === null || product?.price === undefined ? 0 : Number(product.price) || 0;
  const [inputs, setInputs] = useState<ProfitabilityInputs>({
    price,
    productCost: 0,
    platformFees: 0,
    otherVariableCosts: 0,
    adSpend: 50000,
    conversionRate: 0.03,
    refundRate: 0,
  });
  const [result, setResult] = useState<ProfitabilityResult>(() => calculateProfitability({ ...inputs, price }));
  const [scenarios, setScenarios] = useState<ProfitScenario[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (price > 0) {
      setInputs((current) => ({ ...current, price }));
      setResult(calculateProfitability({ ...inputs, price }));
    }
    // The first synchronized product is the initial scenario anchor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [price]);

  function update(key: keyof ProfitabilityInputs, value: string) {
    const number = Number(value);
    const normalized = key === "conversionRate" || key === "refundRate" ? number / 100 : number;
    setInputs((current) => ({ ...current, [key]: Number.isFinite(normalized) ? normalized : 0 }));
  }

  async function runSimulation(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/profitability", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inputs }) });
      const data = await response.json();
      if (response.ok) {
        setResult(data.result);
        setScenarios(data.scenarios ?? []);
      }
    } finally {
      setSaving(false);
    }
  }

  const recommendation = getProfitRecommendation(result);
  const currency = product?.currency ?? "XOF";
  const hasPrice = inputs.price > 0;
  const fieldDescriptions: Record<keyof ProfitabilityInputs, string> = {
    price: "Prix payé par le client pour une vente de ton produit.",
    productCost: "Coût directement lié à la fabrication, la livraison ou la mise à disposition d’une unité du produit.",
    platformFees: "Frais prélevés par Chariow, le moyen de paiement ou une autre plateforme pour chaque vente.",
    otherVariableCosts: "Autres coûts qui augmentent avec chaque vente, par exemple une commission ou un service externe.",
    adSpend: "Montant total que tu prévois de dépenser en publicité pendant la période analysée.",
    conversionRate: "Pourcentage de visiteurs qui deviennent des acheteurs. Exemple : 3 signifie 3 %.",
    refundRate: "Pourcentage des ventes qui sont ensuite remboursées. Exemple : 2 signifie 2 %.",
    targetProfitPerSale: "Bénéfice minimum que tu veux conserver après tous les coûts pour chaque vente.",
  };
  const field = (key: keyof ProfitabilityInputs, label: string, suffix = "") => (
    <label className="profit-field" key={key}>
      <span className="profit-field-label">{label}<button type="button" className="metric-help" aria-label={`Explication : ${label}`} title={fieldDescriptions[key]} onClick={(event) => { event.preventDefault(); event.stopPropagation(); window.alert(fieldDescriptions[key]); }}>?</button></span>
      <div><input type="number" min="0" step="any" value={key === "conversionRate" || key === "refundRate" ? (inputs[key] as number) * 100 : inputs[key] as number} onChange={(event) => update(key, event.target.value)} />{suffix && <small>{suffix}</small>}</div>
    </label>
  );

  return (
    <>
      <div className="page-top">
        <div><span className="eyebrow">Copilote de rentabilité</span><h1>Assistant de profit</h1><p>Réponds à la question la plus importante : combien puis-je investir sans perdre d’argent ?</p></div>
      </div>
      <div className="profit-layout">
        <form className="app-card profit-form" onSubmit={runSimulation}>
          <div className="card-head"><div><span className="eyebrow">Paramètres</span><h2>Construis ton scénario</h2></div><Calculator size={18} color="#4c21f6" /></div>
          {field("price", "Prix de vente", currency)}
          {field("productCost", "Coût produit", currency)}
          {field("platformFees", "Frais plateforme", currency)}
          {field("otherVariableCosts", "Autres coûts variables", currency)}
          {field("adSpend", "Budget publicitaire", currency)}
          {field("conversionRate", "Taux de conversion", "%")}
          {field("refundRate", "Taux de remboursement", "%")}
          <p className="profit-help">Les taux sont à saisir en pourcentage : écris 3 pour 3 %.</p>
          <button className="btn btn-dark" disabled={saving} type="submit">{saving ? "Calcul…" : "Analyser la rentabilité"} <ArrowRight size={15} /></button>
        </form>
        <section className="profit-results">
          <div className="profit-metric-grid">
            <div className="vendeo-kpi"><MetricHelp label="Marge restante par vente" description="Montant restant après le prix du produit, les frais, les coûts variables et les remboursements estimés." /><strong>{formatMoney(result.contributionMargin, currency)}</strong></div>
            <div className="vendeo-kpi"><MetricHelp label="Coût publicitaire maximum par vente" description="Montant maximal que tu peux dépenser en publicité pour obtenir une vente sans dépasser le seuil de rentabilité." /><strong>{formatMoney(result.maxCpa, currency)}</strong></div>
            <div className="vendeo-kpi"><MetricHelp label="Retour publicitaire au point mort" description="Niveau de retour publicitaire à partir duquel tes revenus couvrent exactement tes coûts, sans bénéfice ni perte." /><strong>{result.breakEvenRoas === null ? "Non disponible" : `${result.breakEvenRoas.toFixed(2)}x`}</strong></div>
            <div className="vendeo-kpi"><MetricHelp label="Bénéfice estimé" description="Bénéfice prévu après les coûts variables et le budget publicitaire renseigné." /><strong className={result.expectedProfit < 0 ? "profit-negative" : ""}>{formatMoney(result.expectedProfit, currency)}</strong></div>
          </div>
          <div className="app-card profit-explanation"><div className="card-head"><div><span className="eyebrow">Décision</span><h2>Ce que tu dois faire</h2></div><Lightbulb size={18} color="#d28b3d" /></div><p>{hasPrice ? recommendation.description : "Renseigne d’abord le prix de vente pour obtenir une recommandation de rentabilité fiable."}</p><div className="profit-equation"><span>Budget</span><strong>{formatMoney(inputs.adSpend, currency)}</strong><span>→</span><span>Ventes prévues</span><strong>{Math.ceil(result.expectedSales).toLocaleString("fr-FR")}</strong></div></div>
           <div className="app-card"><div className="card-head"><div><span className="eyebrow">Simulation IA</span><h2>Trois niveaux de risque</h2></div><TrendingUp size={18} color="#103ef8" /></div><div className="scenario-grid">{scenarios.length ? scenarios.map((scenario) => <div className={`scenario-card ${scenario.name}`} key={scenario.name}><strong>{scenario.name}</strong><span>{formatMoney(scenario.expectedProfit, currency)} de bénéfice</span><small>{Math.round(scenario.expectedSales)} vente{Math.round(scenario.expectedSales) > 1 ? "s" : ""} · {formatMoney(scenario.assumptions.budget, currency)} de budget</small></div>) : <p className="profit-help">Lance une simulation pour comparer les scénarios conservateur, central et agressif.</p>}</div></div>
           <div className="profit-hero"><div><span className="eyebrow">Lecture instantanée</span><h2>{hasPrice ? recommendation.title : "Prix de vente manquant"}</h2><p>{hasPrice ? recommendation.description : "Ajoute le prix de vente et les coûts du produit pour savoir si ta publicité peut être rentable."}</p></div><div className={`profit-status ${hasPrice ? recommendation.tone : "warning"}`}><ShieldAlert size={18} /><strong>{hasPrice ? (result.status === "profitable" ? "Rentable" : result.status === "break_even" ? "Point mort" : "À corriger") : "À compléter"}</strong></div></div>
        </section>
      </div>
    </>
  );
}

type MetaPerformance = {
  currency: string;
  period: { from: string; to: string };
  overview: { spend: number; chariowRevenue: number; metaReportedRevenue: number; attributedRevenue: number; conversions: number; sales: number; cpa: number | null; cac: number | null; metaRoas: number | null; realRoas: number | null; attributionCoverage: number };
  performances: Array<{ id: string; name: string; impressions: number; clicks: number; spend: number; conversions: number; cpa: number | null; cac: number | null; roas: number | null; status: string }>;
};

type AdsCache = {
  campaigns: AdCampaign[];
  metaAccounts: Array<{ id: string; name: string | null; currency: string; account_status?: number | null }>;
  selectedMetaAccount: string;
  metaPerformance: MetaPerformance | null;
  metaResources: { pages: Array<{ id: string; name: string }>; pixels: Array<{ id: string; name: string }> } | null;
  metaAccountRestricted: boolean;
  tiktokAccounts: Array<{ id: string; advertiser_id: string; name: string | null; currency: string; status: string | null }>;
  tiktokIdentities: Array<{ id: string; type: string; name: string }>;
};

function AdsView({ products, plan, onPromoteProduct, campaignRefreshKey }: { products: ProductData[]; plan: PlanId; onPromoteProduct: (product: ProductData) => void; campaignRefreshKey: number }) {
  const [cachedOnce] = useState(() => readCache<AdsCache>(ADS_CACHE_KEY));
  const [channel, setChannel] = useState<"overview" | "meta" | "tiktok">("overview");
  // On ne montre l'écran de chargement que la toute première fois : si on a déjà
  // des données en cache (venant d'un précédent passage sur "Pubs"), on les affiche
  // tout de suite et on rafraîchit silencieusement derrière.
  const [loading, setLoading] = useState(!cachedOnce);
  const [message, setMessage] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>(cachedOnce?.campaigns ?? []);

  const [metaAccounts, setMetaAccounts] = useState<Array<{ id: string; name: string | null; currency: string; account_status?: number | null }>>(cachedOnce?.metaAccounts ?? []);
  const [selectedMetaAccount, setSelectedMetaAccount] = useState(cachedOnce?.selectedMetaAccount ?? "");
  const [metaPerformance, setMetaPerformance] = useState<MetaPerformance | null>(cachedOnce?.metaPerformance ?? null);
  const [metaResources, setMetaResources] = useState<{ pages: Array<{ id: string; name: string }>; pixels: Array<{ id: string; name: string }> } | null>(cachedOnce?.metaResources ?? null);
  const [metaAccountRestricted, setMetaAccountRestricted] = useState(cachedOnce?.metaAccountRestricted ?? false);
  const [metaSyncing, setMetaSyncing] = useState(false);

  const [tiktokAccounts, setTiktokAccounts] = useState<Array<{ id: string; advertiser_id: string; name: string | null; currency: string; status: string | null }>>(cachedOnce?.tiktokAccounts ?? []);
  const [tiktokIdentities, setTiktokIdentities] = useState<Array<{ id: string; type: string; name: string }>>(cachedOnce?.tiktokIdentities ?? []);

  async function load() {
    const campaignsResponse = await fetch("/api/ad-campaigns");
    const nextCampaigns = campaignsResponse.ok ? ((await campaignsResponse.json()).campaigns ?? []) : campaigns;
    setCampaigns(nextCampaigns);

    const metaResponse = await fetch("/api/integrations/meta/accounts");
    const metaData = metaResponse.ok ? await metaResponse.json() : { accounts: [] };
    const nextMetaAccounts = metaData.accounts ?? [];
    setMetaAccounts(nextMetaAccounts);
    let nextSelectedMetaAccount = "";
    let nextMetaPerformance: MetaPerformance | null = null;
    let nextMetaResources: { pages: Array<{ id: string; name: string }>; pixels: Array<{ id: string; name: string }> } | null = null;
    let nextMetaAccountRestricted = false;
    if (nextMetaAccounts[0]) {
      nextSelectedMetaAccount = nextMetaAccounts[0].id;
      setSelectedMetaAccount(nextSelectedMetaAccount);
      const metrics = await fetch(`/api/meta/performance?account_id=${encodeURIComponent(nextMetaAccounts[0].id)}`);
      if (metrics.ok) { nextMetaPerformance = await metrics.json(); setMetaPerformance(nextMetaPerformance); }
      const resourceResponse = await fetch(`/api/integrations/meta/resources?account_id=${encodeURIComponent(nextMetaAccounts[0].id)}`);
      if (resourceResponse.ok) { const resourceData = await resourceResponse.json(); nextMetaResources = resourceData; nextMetaAccountRestricted = Boolean(resourceData.account?.restricted); setMetaResources(resourceData); setMetaAccountRestricted(nextMetaAccountRestricted); }
    }

    let nextTiktokAccounts: Array<{ id: string; advertiser_id: string; name: string | null; currency: string; status: string | null }> = [];
    let nextTiktokIdentities: Array<{ id: string; type: string; name: string }> = [];
    if (isAdPlatformAllowed(plan, "tiktok")) {
      const tiktokResponse = await fetch("/api/integrations/tiktok/accounts");
      const tiktokData = tiktokResponse.ok ? await tiktokResponse.json() : { accounts: [] };
      nextTiktokAccounts = tiktokData.accounts ?? [];
      setTiktokAccounts(nextTiktokAccounts);
      if (nextTiktokAccounts[0]) {
        const identityResponse = await fetch(`/api/integrations/tiktok/resources?account_id=${encodeURIComponent(nextTiktokAccounts[0].id)}`);
        if (identityResponse.ok) { nextTiktokIdentities = (await identityResponse.json()).identities ?? []; setTiktokIdentities(nextTiktokIdentities); }
      }
    }
    setLoading(false);
    writeCache(ADS_CACHE_KEY, { campaigns: nextCampaigns, metaAccounts: nextMetaAccounts, selectedMetaAccount: nextSelectedMetaAccount, metaPerformance: nextMetaPerformance, metaResources: nextMetaResources, metaAccountRestricted: nextMetaAccountRestricted, tiktokAccounts: nextTiktokAccounts, tiktokIdentities: nextTiktokIdentities });
  }

  useEffect(() => { void load(); }, [campaignRefreshKey]);

  const connectMeta = () => { window.location.href = "/api/integrations/meta/connect"; };
  const connectTiktok = () => { window.location.href = "/api/integrations/tiktok/connect"; };

  async function syncMeta() {
    if (!selectedMetaAccount) return;
    setMetaSyncing(true);
    setMessage(null);
    try {
      const response = await fetch("/api/meta/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account_id: selectedMetaAccount }) });
      const data = await response.json();
      if (!response.ok) setMessage(data.error ?? "Synchronisation impossible.");
      else { setMessage("Données Meta Ads synchronisées."); const metrics = await fetch(`/api/meta/performance?account_id=${encodeURIComponent(selectedMetaAccount)}`); if (metrics.ok) setMetaPerformance(await metrics.json()); }
    } finally { setMetaSyncing(false); }
  }

  if (loading) return <div className="app-card">Chargement de tes pubs…</div>;

  const metaConnected = metaAccounts.length > 0;
  const tiktokConnected = tiktokAccounts.length > 0;
  const tiktokAllowed = isAdPlatformAllowed(plan, "tiktok");
  const campaignsMeta = campaigns.filter((campaign) => campaign.platform === "meta");
  const campaignsTiktok = campaigns.filter((campaign) => campaign.platform === "tiktok");
  const totalSpend = metaPerformance?.overview.spend ?? 0;

  const channels: Array<{ id: "overview" | "meta" | "tiktok"; label: string }> = [{ id: "overview", label: "Vue générale" }, { id: "meta", label: "Meta" }, ...(tiktokAllowed ? [{ id: "tiktok" as const, label: "TikTok" }] : [])];

  return (
    <>
      <div className="page-top"><div><span className="eyebrow">Acquisition rentable</span><h1>Pubs</h1><p>Lance et suis tes campagnes publicitaires, tous canaux confondus, sans quitter Vendeo.</p></div></div>

      <div className="app-card" style={{ marginBottom: 18, display: "flex", gap: 8, padding: 8 }}>{channels.map((item) => <button key={item.id} type="button" className={`btn ${channel === item.id ? "btn-dark" : "btn-ghost"}`} onClick={() => setChannel(item.id)}>{item.label}</button>)}</div>

      {message && <p className="store-error" role="status">{message}</p>}

      <section className="app-card" style={{ marginBottom: 18 }}><div className="card-head"><div><span className="eyebrow">Nouveau</span><h2>Promouvoir un produit</h2><p>Choisis un produit Chariow et le canal de diffusion — Vendeo demandera la connexion au canal si besoin, seulement à cette étape.</p></div><Rocket size={19} /></div>{products.length ? <div style={{ display: "grid", gap: 10, marginTop: 15 }}>{products.map((product) => <div className="store-row" key={product.id}><div className="store-logo">{product.image ? <img src={product.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} /> : <Package size={18} />}</div><div className="store-info"><strong>{product.name}</strong><span>{formatProductPrice(product)}</span></div><button className="btn btn-dark" type="button" onClick={() => onPromoteProduct(product)}>Promouvoir</button></div>)}</div> : <EmptyState title="Aucun produit disponible" text="Connecte et synchronise une boutique Chariow pour promouvoir un produit." />}</section>

      {channel === "overview" ? (
        <>
          <section className="app-card" style={{ marginBottom: 18 }}><div className="card-head"><h2>Vue générale</h2><BarChart3 size={19} /></div>
            <div className="vendeo-kpi-grid" style={{ marginTop: 12 }}>
              <div className="vendeo-kpi"><MetricHelp label="Dépenses publicitaires totales" description="Somme des dépenses sur les canaux connectés et synchronisés." /><strong>{metaConnected ? formatMoney(totalSpend, metaPerformance?.currency ?? "XOF") : "Non disponible"}</strong></div>
              <div className="vendeo-kpi"><MetricHelp label="Campagnes actives" description="Nombre de campagnes actuellement diffusées, tous canaux confondus." /><strong>{campaigns.filter((campaign) => campaign.status === "active").length}</strong></div>
              <div className="vendeo-kpi"><MetricHelp label="Campagnes en brouillon" description="Campagnes préparées mais pas encore envoyées à une plateforme." /><strong>{campaigns.filter((campaign) => campaign.status === "draft").length}</strong></div>
            </div>
          </section>
          <div className="vendeo-kpi-grid" style={{ marginBottom: 18 }}>
            <div className="app-card"><div className="card-head"><h3>Meta</h3>{metaConnected ? <span className="status-positive meta-connected-badge"><CheckCircle2 size={14} /> Connecté</span> : <span className="status-info">Non connecté</span>}</div>{metaConnected ? <p className="profit-help">{formatMoney(totalSpend, metaPerformance?.currency ?? "XOF")} dépensés · {campaignsMeta.length} campagne(s)</p> : <><p className="profit-help">Connecte Meta Ads pour voir tes statistiques ici.</p><button className="btn btn-ghost" type="button" onClick={connectMeta}>Connecter Meta</button></>}</div>
            {tiktokAllowed ? <div className="app-card"><div className="card-head"><h3>TikTok</h3>{tiktokConnected ? <span className="status-positive meta-connected-badge"><CheckCircle2 size={14} /> Connecté</span> : <span className="status-info">Non connecté</span>}</div>{tiktokConnected ? <p className="profit-help">{campaignsTiktok.length} campagne(s) · statistiques détaillées bientôt disponibles</p> : <><p className="profit-help">Connecte TikTok Ads pour voir tes statistiques ici.</p><button className="btn btn-ghost" type="button" onClick={connectTiktok}>Connecter TikTok</button></>}</div> : <div className="app-card"><div className="card-head"><h3>TikTok</h3><span className="status-info">Non inclus dans ton plan</span></div><p className="profit-help">Passe au plan Starter ou Pro pour diffuser sur TikTok.</p></div>}
          </div>
          <CampaignList campaigns={campaigns} products={products} metaAccounts={metaAccounts} metaPages={metaResources?.pages ?? []} tiktokAccounts={tiktokAccounts} tiktokIdentities={tiktokIdentities} onConnectMeta={connectMeta} onConnectTikTok={connectTiktok} onRefresh={() => void load()} />
        </>
      ) : channel === "meta" ? (
        <>
          <div className="app-card" style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>{metaConnected ? <span className="status-positive meta-connected-badge"><CheckCircle2 size={14} /> Meta Ads connectée</span> : <button className="btn btn-dark" onClick={connectMeta}><Plus size={15} /> Connecter Meta Ads</button>}</div>
          {metaPerformance && metaPerformance.overview.conversions === 0 && <div className="meta-conversion-info" role="status">Meta ne rapporte actuellement aucune conversion attribuée. Cela peut être normal si aucune campagne n’a diffusé ou si aucun Pixel/Conversions API n’est configuré sur le parcours de vente Chariow.</div>}
          {metaAccountRestricted ? <div className="meta-account-warning" role="alert"><AlertTriangle size={18} /><div><strong>Ton compte publicitaire Meta est restreint</strong><p>Vendeo ne peut pas lancer de publicité avec ce compte tant que Meta n’a pas levé la restriction.</p><a href="https://www.facebook.com/accountquality" target="_blank" rel="noreferrer" className="btn btn-ghost">Vérifier dans Meta</a></div></div> : null}
          {metaConnected && metaResources && !metaResources.pages.length ? <div className="meta-conversion-info">Ajoute une page Facebook à ton Business Manager pour pouvoir créer une publicité.</div> : null}
          {!metaConnected ? <div className="empty-state"><BarChart3 size={24} /><strong>Aucun compte Meta Ads connecté</strong><span>Autorise Vendeo à lire tes campagnes, ensembles de publicités et publicités.</span><button className="btn btn-dark" onClick={connectMeta}>Connecter Meta Ads</button></div> : <>
            <div className="app-card meta-toolbar"><label>Compte publicitaire<select value={selectedMetaAccount} onChange={(event) => setSelectedMetaAccount(event.target.value)}>{metaAccounts.map((account) => <option key={account.id} value={account.id}>{account.name ?? account.id}</option>)}</select></label><button className="btn btn-ghost" onClick={syncMeta} disabled={metaSyncing}>{metaSyncing ? "Synchronisation…" : "Synchroniser les insights"}</button></div>
            {metaPerformance ? <><div className="vendeo-kpi-grid meta-kpis"><div className="vendeo-kpi"><MetricHelp label="Dépenses publicitaires" description="Montant dépensé sur Meta Ads pendant la période analysée." /><strong>{formatMoney(metaPerformance.overview.spend, metaPerformance.currency)}</strong></div><div className="vendeo-kpi"><MetricHelp label="Chiffre d’affaires réel Chariow" description="Revenus réellement enregistrés par Chariow." /><strong>{formatMoney(metaPerformance.overview.chariowRevenue, metaPerformance.currency)}</strong></div><div className="vendeo-kpi"><MetricHelp label="Coût moyen par conversion" description="Dépenses divisées par le nombre de conversions déclarées par Meta." /><strong>{metaPerformance.overview.cpa === null ? "Non disponible" : formatMoney(metaPerformance.overview.cpa, metaPerformance.currency)}</strong></div><div className="vendeo-kpi"><MetricHelp label="Coût moyen pour obtenir une vente" description="Dépenses divisées par les ventes réellement enregistrées dans Chariow." /><strong>{metaPerformance.overview.cac === null ? "Non disponible" : formatMoney(metaPerformance.overview.cac, metaPerformance.currency)}</strong></div><div className="vendeo-kpi"><MetricHelp label="Retour publicitaire déclaré par Meta" description="Valeur des achats estimée par Meta divisée par les dépenses." /><strong>{metaPerformance.overview.metaRoas === null ? "Non disponible" : `${metaPerformance.overview.metaRoas.toFixed(2)}x`}</strong></div><div className="vendeo-kpi"><MetricHelp label="Retour publicitaire réel attribué" description="Revenus Chariow reliés à une publicité par attribution, divisés par les dépenses." /><strong>{metaPerformance.overview.realRoas === null ? "Non disponible" : `${metaPerformance.overview.realRoas.toFixed(2)}x`}</strong></div></div><section className="app-card meta-campaigns"><div className="card-head"><div><span className="eyebrow">Analyse média</span><h2>Campagnes qui gagnent ou brûlent du cash</h2></div><Activity size={18} color="#103ef8" /></div><div className="meta-table"><div className="meta-table-head"><span>Campagne</span><span>Dépenses</span><span>Coût par conversion</span><span>Retour publicitaire</span><span>Statut</span></div>{metaPerformance.performances.map((campaign) => <div className="meta-table-row" key={campaign.id}><strong>{campaign.name}</strong><span>{formatMoney(campaign.spend, metaPerformance.currency)}</span><span>{campaign.cpa === null ? "Non disponible" : formatMoney(campaign.cpa, metaPerformance.currency)}</span><span>{campaign.roas === null ? "Non disponible" : `${campaign.roas.toFixed(2)}x`}</span><span className={`meta-status ${campaign.status}`}>{campaign.status === "profitable" ? "Rentable" : campaign.status === "loss" ? "À corriger" : "Sans signal"}</span></div>)}</div>{!metaPerformance.performances.length && <p className="profit-help">Aucune campagne synchronisée. Lance une synchronisation Meta Ads.</p>}</section></> : <div className="empty-state">Synchronise ton compte pour afficher les performances.</div>}
          </>}
        </>
      ) : (
        <>
          <div className="app-card" style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>{tiktokConnected ? <span className="status-positive meta-connected-badge"><CheckCircle2 size={14} /> TikTok Ads connecté</span> : <button className="btn btn-dark" onClick={connectTiktok}><Plus size={15} /> Connecter TikTok Ads</button>}</div>
          {!tiktokConnected ? <div className="empty-state"><BarChart3 size={24} /><strong>Aucun compte TikTok Ads connecté</strong><span>Autorise Vendeo à créer des campagnes sur ton compte publicitaire TikTok.</span><button className="btn btn-dark" onClick={connectTiktok}>Connecter TikTok Ads</button></div> : <div className="meta-conversion-info" role="status">Les statistiques détaillées TikTok Ads (dépenses, ROAS) arrivent bientôt. Tu peux déjà créer et lancer tes campagnes depuis "Promouvoir un produit" ci-dessus — elles apparaissent dans "Mes campagnes" (onglet Vue générale).</div>}
        </>
      )}
    </>
  );
}

const NETWORK_OPTIONS: { id: AdPlatform; label: string; hint: string; live: boolean }[] = [
  { id: "facebook", label: "Facebook & Instagram", hint: "Diffusion via Meta Ads", live: true },
  { id: "tiktok", label: "TikTok", hint: "Diffusion via TikTok Ads", live: true },
  { id: "whatsapp", label: "WhatsApp Business", hint: "Bientôt disponible", live: false },
  { id: "pinterest", label: "Pinterest", hint: "Bientôt disponible", live: false },
  { id: "linkedin", label: "LinkedIn", hint: "Bientôt disponible", live: false },
  { id: "google", label: "Google", hint: "Bientôt disponible", live: false },
];

type CampaignDraft = {
  platform: "meta" | "tiktok";
  network: AdPlatform;
  text: string;
  title: string;
  link: string;
  objective: "sales" | "traffic" | "engagement" | "leads";
  countries: string;
  minAge: string;
  maxAge: string;
  dailyBudget: string;
  duration: string;
  mediaUrl: string;
};

type AdCampaign = {
  id: string;
  product_id: string;
  platform: string;
  status: string;
  objective: string;
  title: string | null;
  countries: string[];
  daily_budget: number | string;
  duration_days: number;
  estimated_budget: number | string;
  external_campaign_id: string | null;
  external_error: string | null;
  created_at: string;
  meta_ad_account_id?: string | null;
  tiktok_ad_account_id?: string | null;
};

function CampaignList({ campaigns, products, metaAccounts, metaPages, tiktokAccounts, tiktokIdentities, onConnectMeta, onConnectTikTok, onRefresh }: { campaigns: AdCampaign[]; products: ProductData[]; metaAccounts: Array<{ id: string; name: string | null; currency: string; account_status?: number | null }>; metaPages: Array<{ id: string; name: string }>; tiktokAccounts: Array<{ id: string; advertiser_id: string; name: string | null; currency: string }>; tiktokIdentities: Array<{ id: string; type: string; name: string }>; onConnectMeta: () => void; onConnectTikTok: () => void; onRefresh: () => void }) {
  const productName = (id: string) => products.find((product) => product.id === id)?.name ?? "Produit Chariow";
  const statusLabel: Record<string, string> = { draft: "Brouillon", account_required: "Compte requis", submitting: "Envoi en cours", review: "En validation", active: "Active", paused: "En pause", rejected: "Refusée", error: "Erreur", completed: "Terminée" };
  const [selectedMeta, setSelectedMeta] = useState<Record<string, string>>({});
  const [selectedPage, setSelectedPage] = useState<Record<string, string>>({});
  const [selectedTiktok, setSelectedTiktok] = useState<Record<string, string>>({});
  const [selectedIdentity, setSelectedIdentity] = useState<Record<string, string>>({});
  const [launching, setLaunching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function launchMeta(campaign: AdCampaign) {
    const accountId = selectedMeta[campaign.id] ?? metaAccounts[0]?.id;
    const page = metaPages.find((item) => item.id === (selectedPage[campaign.id] ?? metaPages[0]?.id));
    if (!accountId) { onConnectMeta(); return; }
    if (!page) { setError("Ajoute une page Facebook à ton Business Manager et reconnecte Meta Ads avant de lancer cette campagne."); return; }
    setLaunching(campaign.id); setError(null);
    try { const response = await fetch(`/api/ad-campaigns/${campaign.id}/launch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ meta_ad_account_id: accountId, page_id: page.id }) }); const data = await response.json().catch(() => ({})); if (!response.ok) setError(data.error ?? "Lancement impossible."); else onRefresh(); } finally { setLaunching(null); }
  }

  async function launchTiktok(campaign: AdCampaign) {
    const accountId = selectedTiktok[campaign.id] ?? tiktokAccounts[0]?.id;
    const identity = tiktokIdentities.find((item) => item.id === (selectedIdentity[campaign.id] ?? tiktokIdentities[0]?.id));
    if (!accountId) { onConnectTikTok(); return; }
    if (!identity) { setError("Connecte un compte TikTok lié à ton Business Center avant de lancer cette campagne."); return; }
    setLaunching(campaign.id); setError(null);
    try { const response = await fetch(`/api/ad-campaigns/${campaign.id}/launch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tiktok_ad_account_id: accountId, identity_id: identity.id, identity_type: identity.type }) }); const data = await response.json().catch(() => ({})); if (!response.ok) setError(data.error ?? "Lancement impossible."); else onRefresh(); } finally { setLaunching(null); }
  }

  const canLaunch = (campaign: AdCampaign) => ["draft", "error", "account_required"].includes(campaign.status);

  return <section className="app-card" style={{ marginBottom: 18 }}><div className="card-head"><div><span className="eyebrow">Suivi</span><h2>Mes campagnes</h2><p>Toutes tes campagnes, tous canaux confondus, préparées dans Vendeo avant leur envoi à la plateforme choisie.</p></div><Megaphone size={19} /></div>{error ? <p className="store-error" role="alert">{error}</p> : null}{campaigns.length ? <div className="home-table" style={{ marginTop: 15 }}><div className="home-table-row home-table-head"><span>Produit</span><span>Canal</span><span>Budget</span><span>Statut</span><span>Action</span></div>{campaigns.map((campaign) => <div className="home-table-row" key={campaign.id}><span>{productName(campaign.product_id)}</span><span>{campaign.platform === "meta" ? "Meta" : campaign.platform === "tiktok" ? "TikTok" : campaign.platform}</span><span>{Number(campaign.estimated_budget).toLocaleString("fr-FR")} XOF</span><span className={campaign.status === "active" ? "status-positive" : "status-warning"}>{statusLabel[campaign.status] ?? campaign.status}</span><span>{!canLaunch(campaign) ? "-" : campaign.platform === "meta" ? <><select aria-label={`Compte Meta pour ${productName(campaign.product_id)}`} value={selectedMeta[campaign.id] ?? metaAccounts[0]?.id ?? ""} onChange={(event) => setSelectedMeta((current) => ({ ...current, [campaign.id]: event.target.value }))} disabled={!metaAccounts.length}><option value="">Compte Meta</option>{metaAccounts.map((account) => <option key={account.id} value={account.id}>{account.name ?? account.id}</option>)}</select><select aria-label={`Page Facebook pour ${productName(campaign.product_id)}`} value={selectedPage[campaign.id] ?? metaPages[0]?.id ?? ""} onChange={(event) => setSelectedPage((current) => ({ ...current, [campaign.id]: event.target.value }))} disabled={!metaPages.length}><option value="">Page Facebook</option>{metaPages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}</select><button className="btn btn-dark" type="button" onClick={() => void launchMeta(campaign)} disabled={launching === campaign.id || !metaAccounts.length || !metaPages.length}>{launching === campaign.id ? "Lancement…" : !metaAccounts.length ? "Connecter Meta" : "Lancer"}</button></> : campaign.platform === "tiktok" ? <><select aria-label={`Compte TikTok pour ${productName(campaign.product_id)}`} value={selectedTiktok[campaign.id] ?? tiktokAccounts[0]?.id ?? ""} onChange={(event) => setSelectedTiktok((current) => ({ ...current, [campaign.id]: event.target.value }))} disabled={!tiktokAccounts.length}><option value="">Compte TikTok</option>{tiktokAccounts.map((account) => <option key={account.id} value={account.id}>{account.name ?? account.advertiser_id}</option>)}</select><select aria-label={`Identité TikTok pour ${productName(campaign.product_id)}`} value={selectedIdentity[campaign.id] ?? tiktokIdentities[0]?.id ?? ""} onChange={(event) => setSelectedIdentity((current) => ({ ...current, [campaign.id]: event.target.value }))} disabled={!tiktokIdentities.length}><option value="">Identité TikTok</option>{tiktokIdentities.map((identity) => <option key={identity.id} value={identity.id}>{identity.name}</option>)}</select><button className="btn btn-dark" type="button" onClick={() => void launchTiktok(campaign)} disabled={launching === campaign.id || !tiktokAccounts.length || !tiktokIdentities.length}>{launching === campaign.id ? "Lancement…" : !tiktokAccounts.length ? "Connecter TikTok" : "Lancer"}</button></> : "-"}</span></div>)}</div> : <EmptyState title="Aucune campagne" text="Ta première campagne apparaîtra ici après son enregistrement." />}</section>;
}

function CampaignWizard({ product, plan, onClose, onSaved }: { product: ProductData; plan: PlanId; onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<CampaignDraft>({ platform: "meta", network: "facebook", text: "", title: product.name, link: product.url ?? "", objective: "sales", countries: "Bénin", minAge: "18", maxAge: "35", dailyBudget: "2500", duration: "7", mediaUrl: "" });
  const [mediaPreview, setMediaPreview] = useState<{ url: string; name: string; type: string } | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const total = Math.max(0, Number(draft.dailyBudget) || 0) * Math.max(0, Number(draft.duration) || 0);
  const update = (key: keyof CampaignDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  function handleMediaChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (mediaPreview) URL.revokeObjectURL(mediaPreview.url);
    const url = URL.createObjectURL(file);
    setMediaPreview({ url, name: file.name, type: file.type });
    setMediaFile(file);
    update("mediaUrl", url);
    setMediaError(null);
    void uploadMedia(file, url);
  }

  async function uploadMedia(file: File, localUrl: string) {
    setUploadingMedia(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/uploads/campaign-media", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.secure_url !== "string") {
        setMediaError(data.error ?? "Le média n’a pas pu être transféré.");
        return;
      }
      if (localUrl === mediaPreview?.url) update("mediaUrl", data.secure_url);
    } catch {
      setMediaError("Impossible de contacter le service d’upload.");
    } finally {
      setUploadingMedia(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step < 4) { setStep((current) => current + 1); return; }
    setSaving(true);
    setMessage(null);
    try {
      let mediaUrl = draft.mediaUrl;
      if (mediaFile && !mediaUrl.startsWith("https://res.cloudinary.com/")) {
        setUploadingMedia(true);
        const mediaForm = new FormData();
        mediaForm.append("file", mediaFile);
        const uploadResponse = await fetch("/api/uploads/campaign-media", { method: "POST", body: mediaForm });
        const uploadData = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok) { setMessage(uploadData.error ?? "Upload du média impossible."); return; }
        mediaUrl = uploadData.secure_url;
        update("mediaUrl", mediaUrl);
      }
      if (mediaFile && mediaUrl.startsWith("blob:")) { setMessage("Attends la fin du transfert du média avant d’enregistrer."); return; }
const payload = { product_id: product.id, product_name: product.name, ...draft, platform: draft.network === "tiktok" ? "tiktok" : "meta", media_url: mediaUrl, media_name: mediaFile?.name ?? null, media_type: mediaFile?.type ?? null, daily_budget: Number(draft.dailyBudget), duration_days: Number(draft.duration), estimated_budget: total };      const response = await fetch("/api/ad-campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(data.error ?? "Impossible d’enregistrer la campagne."); return; }
      onSaved();
      setMessage("Campagne enregistrée en brouillon. Tu peux maintenant la lancer depuis Mes campagnes.");
    } finally { setSaving(false); setUploadingMedia(false); }
  }

  const steps = [{ number: 1, label: "Campagne", hint: "Choix de diffusion" }, { number: 2, label: "Contenu", hint: "Texte et creative" }, { number: 3, label: "Audience", hint: "Personnes ciblées" }, { number: 4, label: "Budget", hint: "Durée et montant" }];
  const mediaPicker = <div className="campaign-upload"><input ref={mediaInputRef} className="campaign-file-input" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" onChange={handleMediaChange} />{mediaPreview ? <>{mediaPreview.type.startsWith("image/") ? <img className="campaign-upload-preview" src={mediaPreview.url} alt="Aperçu de la creative" /> : <span className="campaign-upload-video"><Rocket size={20} /></span>}<strong>{mediaPreview.name}</strong><small>{uploadingMedia ? "Chargement…" : mediaError ?? "Fichier sélectionné · Cliquer pour remplacer"}</small></> : <><span className="campaign-upload-icon"><Plus size={20} /></span><strong>Ajouter une image ou une vidéo</strong><small>JPG, PNG ou MP4</small></>}<button className="btn btn-ghost campaign-upload-button" type="button" onClick={() => mediaInputRef.current?.click()}>{mediaPreview ? "Remplacer le fichier" : "Choisir un fichier"}</button></div>;
  return <div className="campaign-modal-backdrop" role="presentation" onClick={onClose}><section className="campaign-modal" role="dialog" aria-modal="true" aria-labelledby="campaign-wizard-title" onClick={(event) => event.stopPropagation()}><header className="campaign-modal-header"><div className="campaign-heading"><div className="campaign-product-thumb">{product.image ? <img src={product.image} alt="" /> : <Package size={20} />}</div><div><span className="eyebrow">Créer une campagne</span><h2 id="campaign-wizard-title">Promouvoir « {product.name} »</h2><p>Prépare ta campagne simplement, puis envoie-la à Meta après vérification.</p></div></div><button type="button" className="campaign-close" aria-label="Fermer" onClick={onClose}>×</button></header>{message ? <div className="campaign-success" role="status"><CheckCircle2 size={20} /><div><strong>Campagne enregistrée</strong><p>{message}</p></div><button className="btn btn-dark" type="button" onClick={onClose}>Fermer</button></div> : <form onSubmit={submit}><nav className="campaign-stepper" aria-label="Étapes de la campagne">{steps.map((item) => <div className={`campaign-step ${step === item.number ? "current" : ""} ${step > item.number ? "done" : ""}`} key={item.number}><span className="campaign-step-number">{step > item.number ? "✓" : item.number}</span><span><strong>{item.label}</strong><small>{item.hint}</small></span></div>)}</nav><div className="campaign-modal-body"><div className="campaign-form-card">{step === 1 ? <><div className="campaign-section-intro"><span className="campaign-icon"><Megaphone size={18} /></span><div><h3>Où veux-tu diffuser ?</h3><p>Commence par choisir la plateforme et l’objectif de ta campagne.</p></div></div><div className="campaign-choice-grid">{NETWORK_OPTIONS.map((option) => { const allowed = isAdPlatformAllowed(plan, option.id); const selectable = option.live && allowed; return <label key={option.id} className={`campaign-choice ${draft.network === option.id ? "selected" : ""} ${!selectable ? "disabled" : ""}`}><input type="radio" name="network" checked={draft.network === option.id} disabled={!selectable} onChange={() => selectable && update("network", option.id)} /><span className="campaign-choice-logo"><ChannelBadge id={option.id} /></span><span><strong>{option.label}</strong><small>{!allowed ? "Non inclus dans ton plan" : option.hint}</small></span>{draft.network === option.id ? <CheckCircle2 size={18} /> : null}</label>; })}</div><label className="campaign-field"><span>Objectif de campagne</span><select value={draft.objective} onChange={(event) => update("objective", event.target.value)}><option value="sales">Ventes</option><option value="traffic">Trafic</option><option value="engagement">Interactions</option><option value="leads">Prospects</option></select><small>Choisis le résultat que tu veux obtenir en priorité.</small></label></> : null}{step === 2 ? <><div className="campaign-section-intro"><span className="campaign-icon"><ImageIcon size={18} /></span><div><h3>Donne envie de cliquer</h3><p>Ajoute le contenu que les personnes verront dans leur fil.</p></div></div><label className="campaign-field"><span>Texte publicitaire</span><textarea required rows={5} value={draft.text} onChange={(event) => update("text", event.target.value)} placeholder="Présente ton produit et explique pourquoi il est utile." /><small>Un message clair, court et centré sur le bénéfice fonctionne généralement mieux.</small></label><div className="campaign-field-row"><label className="campaign-field"><span>Titre</span><input required value={draft.title} onChange={(event) => update("title", event.target.value)} /></label><label className="campaign-field"><span>Lien de destination</span><input type="url" required value={draft.link} onChange={(event) => update("link", event.target.value)} placeholder="https://..." /></label></div>{mediaPicker}</> : null}{step === 3 ? <><div className="campaign-section-intro"><span className="campaign-icon"><Target size={18} /></span><div><h3>À qui veux-tu t’adresser ?</h3><p>Définis une audience simple. Tu pourras l’affiner plus tard.</p></div></div><label className="campaign-field"><span>Pays ciblés</span><input required value={draft.countries} onChange={(event) => update("countries", event.target.value)} placeholder="Bénin, Côte d’Ivoire" /><small>Sépare plusieurs pays par une virgule.</small></label><div className="campaign-field-row"><label className="campaign-field"><span>Âge minimum</span><input type="number" min="13" max="65" value={draft.minAge} onChange={(event) => update("minAge", event.target.value)} /></label><label className="campaign-field"><span>Âge maximum</span><input type="number" min="13" max="65" value={draft.maxAge} onChange={(event) => update("maxAge", event.target.value)} /></label></div><div className="campaign-info"><CheckCircle2 size={17} /><p><strong>Suivi automatisé</strong><br />Vendeo préparera le suivi des visites et des ventes. Tu n’as pas besoin de configurer un pixel.</p></div></> : null}{step === 4 ? <><div className="campaign-section-intro"><span className="campaign-icon"><WalletCards size={18} /></span><div><h3>Définis ton investissement</h3><p>Le budget est payé directement à Meta depuis ton compte publicitaire.</p></div></div><div className="campaign-field-row"><label className="campaign-field"><span>Budget quotidien</span><div className="campaign-input-addon"><input required type="number" min="100" step="100" value={draft.dailyBudget} onChange={(event) => update("dailyBudget", event.target.value)} /><small>XOF</small></div></label><label className="campaign-field"><span>Durée</span><div className="campaign-input-addon"><input required type="number" min="1" max="90" value={draft.duration} onChange={(event) => update("duration", event.target.value)} /><small>jours</small></div></label></div><div className="campaign-budget-card"><div><span>Budget publicitaire estimé</span><small>{Number(draft.dailyBudget).toLocaleString("fr-FR")} XOF × {draft.duration} jour{Number(draft.duration) > 1 ? "s" : ""}</small></div><strong>{total.toLocaleString("fr-FR")} XOF</strong></div><div className="campaign-info neutral"><Info size={17} /><p>Meta facturera ce budget selon les conditions de ton compte. Vendeo ne facture aucun frais supplémentaire.</p></div></> : null}</div><aside className="campaign-preview"><span className="eyebrow">Résumé</span><h3>{product.name}</h3><div className="campaign-preview-media">{product.image ? <img src={product.image} alt="Aperçu du produit" /> : <Package size={28} />}</div><dl><div><dt>Plateforme</dt><dd>{NETWORK_OPTIONS.find((option) => option.id === draft.network)?.label ?? "Facebook & Instagram"}</dd></div><div><dt>Objectif</dt><dd>{draft.objective === "sales" ? "Ventes" : draft.objective === "traffic" ? "Trafic" : draft.objective === "engagement" ? "Interactions" : "Prospects"}</dd></div><div><dt>Audience</dt><dd>{draft.countries || "À définir"}</dd></div><div><dt>Budget</dt><dd>{total.toLocaleString("fr-FR")} XOF</dd></div></dl></aside></div><footer className="campaign-modal-footer">{step > 1 ? <button className="btn btn-ghost" type="button" onClick={() => setStep((current) => current - 1)}>Retour</button> : <span className="campaign-footer-note">Étape {step} sur 4</span>}<button className="btn btn-dark" type="submit" disabled={saving}>{saving ? "Enregistrement…" : step < 4 ? "Continuer" : "Enregistrer le brouillon"}<ArrowRight size={15} /></button></footer></form>}</section></div>;
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
  const raw = product.price as unknown;
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>).value ?? (raw as Record<string, unknown>).amount ?? (raw as Record<string, unknown>).price : raw;
  const currency = product.currency ?? (raw && typeof raw === "object" ? String((raw as Record<string, unknown>).currency ?? (raw as Record<string, unknown>).currency_code ?? "") : "");
  if (value === null || value === undefined || value === "") return "Prix non renseigné";
  return `${value}${currency ? ` ${currency}` : ""}`;
}

function ChatView({ onGoToSubscription, onUsageChange }: { onGoToSubscription: () => void; onUsageChange: (patch: Partial<SubscriptionData>) => void }) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [usage, setUsage] = useState<{ free_used: number; free_limit: number; used: number; limit: number; trialActive: boolean; status: string; plan: string } | null>(null);
  const [plansRequired, setPlansRequired] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Record<number, boolean>>({});

  const bottomRef = (node: HTMLDivElement | null) => {
    // Ref callback for compatibility.
    if (node) {
      // Store the node for later scrolling.
    }
  };
  const [bottomNode, setBottomNode] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    // Prefill from Overview actions without leaking the prompt in the URL.
    const pending = sessionStorage.getItem(SESSION_STORAGE_PROMPT_KEY);
    if (pending && typeof pending === "string") {
      setInput(pending);
      sessionStorage.removeItem(SESSION_STORAGE_PROMPT_KEY);
    }
  }, []);

  useEffect(() => {
    fetch("/api/chat")
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((data) => setMessages(data.messages ?? []));
    fetch("/api/subscription")
      .then((r) => (r.ok ? r.json() : { subscription: null }))
      .then((data) => {
        const nextUsage = data.subscription
          ? {
              free_used: data.subscription.free_messages_used,
              free_limit: data.subscription.free_messages_limit,
              used: data.subscription.messages_used_this_month,
              limit: data.subscription.messages_limit, trialActive: Boolean(data.subscription.trial_active), status: data.subscription.status, plan: data.subscription.plan,
            }
          : null;
        setUsage(nextUsage);
        if (nextUsage) setPlansRequired(nextUsage.trialActive ? nextUsage.free_used >= nextUsage.free_limit : nextUsage.status !== "active" || nextUsage.used >= nextUsage.limit);
      });
  }, []);

  useEffect(() => {
    // Auto-scroll to the latest message.
    if (!bottomNode) return;
    bottomNode.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, sending, bottomNode]);

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
        const nextUsage = {
          free_used: data.usage.free_used,
          free_limit: data.usage.free_limit,
          used: data.usage.used,
          limit: data.usage.limit, trialActive: Boolean(data.usage.trial_active), status: data.usage.status, plan: data.usage.plan,
        };
        setUsage(nextUsage);
        setPlansRequired(nextUsage.trialActive ? nextUsage.free_used >= nextUsage.free_limit : nextUsage.status !== "active" || nextUsage.used >= nextUsage.limit);

        // Sync quota vers le parent (sidebar + page Abonnement)
        onUsageChange({
          free_messages_used: nextUsage.free_used,
          free_messages_limit: nextUsage.free_limit,
          messages_used_this_month: nextUsage.used,
          messages_limit: nextUsage.limit,
          plan: nextUsage.plan,
          status: nextUsage.status,
          trial_active: nextUsage.trialActive,
        });
      }
    } else {
      if (data.code === "PLANS_REQUIRED") {
        setPlansRequired(true);
        setMessages((current) => [
          ...current,
          { role: "assistant", content: "Active un plan pour continuer à utiliser Vendeo AI." },
        ]);
      } else {
        setMessages((current) => [...current, { role: "assistant", content: data.error ?? "Une erreur est survenue." }]);
      }
    }
    setSending(false);
  }

  const freeRemaining = usage ? Math.max(0, usage.free_limit - usage.free_used) : 3;

  return (
    <div className="app-card chat-card" style={{ maxWidth: 760 }}>
      {usage && (plansRequired || usage.trialActive) && (
        <div className="trial-banner">
          {plansRequired ? (
            <>
              <strong>Active un plan pour continuer.</strong>{" "}
              <button
                className="btn btn-dark"
                onClick={onGoToSubscription}
                style={{ fontSize: 10, padding: "7px 10px", marginLeft: 8 }}
                type="button"
              >
                Voir les offres
              </button>
            </>
          ) : usage.trialActive ? (
            <>
              <strong>
                {freeRemaining} requête{freeRemaining > 1 ? "s" : ""} gratuite{freeRemaining > 1 ? "s" : ""}
              </strong>
              {' '}restante{freeRemaining > 1 ? "s" : ""}. Découvre Vendeo avant de choisir ton plan.
            </>
          ) : null}
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <b><Sparkles size={15} /> Vendeo</b>
            <br />Tu as 3 requêtes gratuites pour découvrir ton analyste IA.
          </div>
        )}
        {messages.map((message, index) => {
          const content = cleanAiText(message.content);
          const isLong = content.length > 520;
          const expanded = expandedMessages[index] === true;
          return (
            <div key={index} className={message.role === "user" ? "chat-bubble user" : "chat-bubble assistant"}>
              <div className={!expanded && isLong ? "chat-message-preview" : undefined}>
                {expanded || !isLong ? content : `${content.slice(0, 520).trimEnd()}…`}
              </div>
              {isLong && <button type="button" className="chat-see-more" onClick={() => setExpandedMessages((current) => ({ ...current, [index]: !expanded }))}>{expanded ? "Voir moins" : "Voir plus"}</button>}
            </div>
          );
        })}

        <div ref={setBottomNode} />
      </div>

      <div className="chat-composer">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="chat-input-form"
        >
          <input
            disabled={plansRequired}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={plansRequired ? "Choisis un plan pour continuer" : "Pose ta question..."}
          />
          <button
            className="btn btn-dark"
            disabled={sending || plansRequired}
            style={{ borderRadius: 6, fontSize: 11, padding: "9px 14px" }}
          >
            {sending ? "…" : plansRequired ? "Plans" : "Envoyer"}
          </button>
        </form>
      </div>
    </div>
  );
}

function StoresView({ stores, onStoresChange, onBackToSettings }: { stores: StoreData[]; onStoresChange: (stores: StoreData[]) => void; onBackToSettings?: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const maxStores = stores.length > 1 ? 3 : 1;

  async function connectChariow(storeId?: string) {
    setError("");
    setSaving(true);
    try {
      if (!storeId) {
        const check = await fetch("/api/integrations/chariow/connect/check");
        const checkData = await check.json().catch(() => ({}));
        if (!check.ok) {
          if (checkData.code === "STORE_LIMIT") setShowUpgrade(true);
          else setError(checkData.error ?? "Impossible de lancer la connexion Chariow.");
          return;
        }
      }

      const target = storeId
        ? `/api/integrations/chariow/connect?store_id=${encodeURIComponent(storeId)}`
        : "/api/integrations/chariow/connect";
      window.location.href = target;
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


  async function deleteStore(id: string) {
    if (!window.confirm("Supprimer cette boutique ? Ses identifiants de connexion seront supprimés de Vendeo.")) return;
    setError("");
    setDeletingId(id);
    try {
      const res = await fetch(`/api/stores/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Impossible de supprimer la boutique.");
        return;
      }
      onStoresChange(stores.filter((store) => store.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="page-top">
        <div>
          <span className="eyebrow">Connexions</span>
          <h1>Mes boutiques</h1>
          <p>Une source de vérité pour toutes tes ventes. <strong className="store-count">{stores.length}/{maxStores}</strong></p>
        </div>
        {onBackToSettings && <button type="button" className="mobile-back-button" onClick={onBackToSettings}><ArrowRight size={15} style={{ transform: "rotate(180deg)" }} /> Paramètres</button>}
        <button type="button" className="btn btn-dark" onClick={() => connectChariow()} disabled={saving}>
          <Plus size={16} /> {saving ? "Ajout en cours…" : "Ajouter une boutique"}
        </button>
      </div>

      {error && <p className="store-error" role="alert">{error}</p>}

      <div className="app-card" style={{ maxWidth: 760 }}>
        {stores.map((store) => {
          const status = store.connection_status ?? "pending";
          const canDisconnect = status === "connected";
          return (
            <div className="store-row" key={store.id}>
              <div className="store-logo">
                {store.logo_url || store.image ? <img src={store.logo_url ?? store.image ?? ""} alt="" /> : store.platform.slice(0, 1).toUpperCase()}
              </div>
              <div className="store-info">
                <strong>{store.store_name}</strong>
                <span>
                  {store.platform} · {status === "failed" ? "Connexion échouée — relance l’autorisation" : status}
                </span>
              </div>
              <span className="status">● {status}</span>
              {canDisconnect ? (
                <button className="btn btn-ghost" onClick={() => disconnectChariow(store.id)} disabled={saving} style={{ fontSize: 10, padding: "7px 10px" }}>
                  Déconnecter
                </button>
              ) : (
                  <button type="button" className="btn btn-ghost" onClick={() => connectChariow(store.id)} disabled={saving} style={{ fontSize: 10, padding: "7px 10px" }}>
                  {status === "failed" || status === "expired" ? "Reconnecter Chariow" : "Réessayer"}
                 </button>
               )}
               <button className="btn btn-danger-ghost" onClick={() => deleteStore(store.id)} disabled={saving || deletingId === store.id} style={{ fontSize: 10, padding: "7px 10px" }}>
                 {deletingId === store.id ? "Suppression…" : "Supprimer"}
               </button>
            </div>
          );
        })}
        {stores.length === 0 && <div className="empty-state compact">Aucune boutique connectée.</div>}

      </div>
      {showUpgrade && <div className="modal-backdrop" role="presentation" onClick={() => setShowUpgrade(false)}><div className="upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="upgrade-title" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowUpgrade(false)} aria-label="Fermer">×</button><span className="eyebrow">Limite de ton abonnement</span><h2 id="upgrade-title">Connecte plusieurs boutiques</h2><p>Ton plan actuel autorise une seule boutique. Passe au plan Pro pour en connecter jusqu’à trois.</p><button className="btn btn-dark" onClick={() => document.querySelector<HTMLButtonElement>(".side-link:nth-of-type(6)")?.click()}>Passer au plan Pro <ArrowRight size={15} /></button></div></div>}
    </>
  );
}

function SubscriptionView({ subscription, onBackToSettings }: { subscription: SubscriptionData | null; onBackToSettings?: () => void }) {
  const plan = subscription?.plan ?? "starter";
  const trial = subscription?.trial_active ?? true;
  const isActive = subscription?.status === "active" && !trial;

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

  if (isActive) {
    const used = subscription?.messages_used_this_month ?? 0;
    const limit = subscription?.messages_limit ?? (plan === "pro" ? 1200 : 400);
    const remaining = Math.max(0, limit - used);
    const periodStart = subscription?.current_period_start ? new Date(subscription.current_period_start).toLocaleDateString("fr-FR") : "Non disponible";
    const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString("fr-FR") : "Non disponible";
     return <><div className="page-top"><div><span className="eyebrow">Ton abonnement</span><h1>Plan {plan === "pro" ? "Pro" : "Starter"} actif</h1><p>Gère ton plan et ton usage IA depuis un seul endroit.</p></div>{onBackToSettings && <button type="button" className="mobile-back-button" onClick={onBackToSettings}><ArrowRight size={15} style={{ transform: "rotate(180deg)" }} /> Paramètres</button>}</div><div className="app-card" style={{ maxWidth: 520 }}><span className="eyebrow">Abonnement en cours</span><h2 style={{ marginTop: 6 }}>{plan === "pro" ? "Pro — 9 000 XOF / mois" : "Starter — 5 000 XOF / mois"}</h2><div className="sale-detail-grid" style={{ marginTop: 18 }}><div><small>Période en cours depuis</small><strong>{periodStart}</strong></div><div><small>Renouvellement</small><strong>{periodEnd}</strong></div><div><small>Messages utilisés</small><strong>{used.toLocaleString("fr-FR")} / {limit.toLocaleString("fr-FR")}</strong></div><div><small>Messages restants</small><strong>{remaining.toLocaleString("fr-FR")}</strong></div></div>{plan !== "pro" && <button className="btn btn-dark" style={{ marginTop: 20 }} onClick={() => changePlan("pro")}>Passer au Pro <ArrowRight size={15} /></button>}</div></>;
  }

  return (
    <>
      <div className="page-top">
        <div>
          <span className="eyebrow">Ton abonnement</span>
          <h1>Grandis à ton rythme.</h1>
          <p>Gère ton plan et ton usage IA depuis un seul endroit.</p>
        </div>
        {onBackToSettings && <button type="button" className="mobile-back-button" onClick={onBackToSettings}><ArrowRight size={15} style={{ transform: "rotate(180deg)" }} /> Paramètres</button>}
      </div>
      <div className="pricing-wrap" style={{ maxWidth: 800 }}>
        <article className="price-card">
          <span className="eyebrow">{trial ? "Essai gratuit" : "Plan disponible"}</span>
          <h3>Starter</h3>
           <div className="price">5 000 XOF <small>/ mois</small></div>
          <ul>
            <li>✓ 400 messages IA / mois</li>
            <li>✓ 1 boutique connectée</li>
            <li>✓ Support standard</li>
          </ul>
          <button
            className="btn btn-ghost"
            onClick={() => changePlan("starter")}
            style={{ width: "100%" }}
          >
            Souscrire à Starter
          </button>
        </article>
        <article className="price-card pro">
          <span className="pill" style={{ marginBottom: 18 }}>Recommandé</span>
          <h3>Pro</h3>
           <div className="price">9 000 XOF <small>/ mois</small></div>
          <ul>
            <li>✓ 1 200 messages IA / mois</li>
            <li>✓ Jusqu'à 3 boutiques</li>
            <li>✓ Rapports automatiques</li>
            <li>✓ Support prioritaire</li>
          </ul>
          <button className="btn btn-lime" disabled={plan === "pro" && !trial} onClick={() => changePlan("pro")} style={{ width: "100%" }}>
            {plan === "pro" && !trial ? "Plan actuel" : "Passer au Pro"}
          </button>
        </article>
      </div>
    </>
  );
}
