"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BarChart3, CreditCard, Plus, Settings, Store, MessageSquare, LayoutDashboard, Package, CalendarDays, Users, Eye, ShoppingBag, Lightbulb, Activity, AlertTriangle, Target, TrendingUp, ShieldAlert, CheckCircle2, Brain, LineChart, Sparkles, LogOut, Megaphone, FileText, Trash2, Sun, Moon, ImageIcon, Video } from "lucide-react";
import { FaFacebookF, FaInstagram, FaTiktok, FaWhatsapp, FaLinkedinIn, FaPinterestP } from "react-icons/fa6";
import { ChatView } from "@/components/ChatView";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useSearchParams } from "next/navigation";
import { formatMoney } from "@/lib/format";
import { isAdPlatformAllowed, planMaxStores, type AdPlatform, type PlanId } from "@/lib/plans";
import {
  VerdictBanner,
  ImpactFinancierCard,
  LaunchAdBar,
  CampaignCrossTable,
  DiagnosticBoutique,
  type VerdictBannerData,
  type CampaignRow,
  type CampaignVerdictBadge,
  type DiagnosticCard,
} from "@/components/vendeo";
import { DiagnosticFunnel } from "@/components/vendeo/DiagnosticFunnel";
import { AdCampaignsList } from "@/components/vendeo/AdCampaignsList";
import { LaunchAdWizard } from "@/components/vendeo/wizard";
import { CREDIT_PRICE_XOF } from "@/lib/studio/credits";

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
  plan: "starter";
  messages_used_this_month: number;
  messages_limit: number;
  free_messages_used: number;
  free_messages_limit: number;
  status: string;
  trial_active?: boolean;
  trial_ends_at?: string;
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
  return 3;
}

  // Pop-up bloquante affichée dès que l'essai gratuit de 15 jours (ou l'abonnement payant)
// est expiré côté base (subscriptions.status = 'past_due'). "Plus tard" masque la pop-up
// pour la session en cours seulement — elle réapparaîtra à la prochaine connexion tant
// que l'abonnement n'est pas activé.
function TrialPaywallModal({ subscription }: { subscription: SubscriptionData | null }) {
  const [dismissed, setDismissed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const shouldShow = subscription?.status === "past_due" && !dismissed;
  if (!shouldShow) return null;

  async function subscribe() {
    setSubscribing(true);
    try {
      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "starter" }),
      });
      const data = await response.json();
      if (response.ok && data.payment?.url) {
        window.location.href = data.payment.url;
      } else {
        window.alert(data.error ?? "Impossible de lancer le paiement.");
        setSubscribing(false);
      }
    } catch {
      window.alert("Impossible de lancer le paiement.");
      setSubscribing(false);
    }
  }

  return (
    <div className="account-delete-backdrop" role="presentation">
      <section className="account-delete-modal" role="dialog" aria-modal="true" aria-labelledby="trial-paywall-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="account-delete-close" aria-label="Fermer" onClick={() => setDismissed(true)}>×</button>
        <span className="eyebrow">Essai terminé</span>
        <h2 id="trial-paywall-title">Ton essai gratuit de 15 jours est terminé</h2>
        <p>Active l’abonnement Vendeo — 2 000 XOF/mois — pour continuer à utiliser l’analyse IA, les rapports et le suivi de tes pubs.</p>
        <div className="account-delete-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setDismissed(true)}>Plus tard</button>
          <button type="button" className="btn btn-dark" onClick={() => void subscribe()} disabled={subscribing}>{subscribing ? "Redirection…" : "Activer mon abonnement"}</button>
        </div>
      </section>
    </div>
  );
}

export function Dashboard() {
  const [active, setActive] = useState("Vue d’ensemble");
  const [moreOpen, setMoreOpen] = useState(false);
  // Se souvient de la section affichée juste avant d'ouvrir "Vendeo AI", pour que
  // le bouton retour de la section IA ramène exactement là d'où l'utilisateur vient
  // (au lieu de toujours revenir à la Vue d'ensemble).
  const [previousSection, setPreviousSection] = useState("Vue d’ensemble");
  const activeSectionRef = useRef(active);
  useEffect(() => {
    if (activeSectionRef.current !== "Vendeo AI") {
      setPreviousSection(activeSectionRef.current);
    }
    activeSectionRef.current = active;
  }, [active]);

  // Bouton retour Android / geste retour navigateur : sans ceci, le retour
  // système quitte directement l'appli au lieu de revenir à la section
  // précédente. On pousse une entrée d'historique à chaque changement de
  // section déclenché dans l'app, et on écoute "popstate" pour ramener
  // "active" à l'état précédent au lieu de laisser le navigateur naviguer.
  const isPopStateNav = useRef(false);
  useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      isPopStateNav.current = true;
      setActive((event.state && event.state.vendeoView) || "Vue d’ensemble");
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  useEffect(() => {
    if (isPopStateNav.current) {
      isPopStateNav.current = false;
      return;
    }
    window.history.pushState({ vendeoView: active }, "", window.location.href);
  }, [active]);

  const searchParams = useSearchParams();
  const [stores, setStores] = useState<StoreData[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [analytics, setAnalytics] = useState<AnalyticsData>(null);
  const [userName, setUserName] = useState("créateur");

  const userFirstName = (userName || "créateur").trim().split(/\s+/)[0] ?? "créateur";
  // Plus de quota de messages IA : l'accès est illimité tant que l'essai de
  // 15 jours ou l'abonnement Vendeo est actif.
  const isActivePlan = subscription?.status === "active" && subscription?.trial_active === false;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [campaignsVersion, setCampaignsVersion] = useState(0);
  // Le formulaire de création de pub (LaunchAdWizard) vit ici, au niveau de l'appli,
  // pour que le bouton "Lancer une pub" de l'accueil ET celui de l'onglet "Pub"
  // ouvrent directement le même formulaire, au lieu que celui de "Pub" se contente
  // de changer d'onglet en laissant l'utilisateur cliquer une seconde fois.
  function launchAd() {
    if (!stores[0]?.id) {
      setActive("Mes boutiques");
      return;
    }
    setWizardOpen(true);
  }

  const links = [
    ["Vue d’ensemble", LayoutDashboard],
    ["Vendeo AI", MessageSquare],
    ["Studio", Sparkles],
    ["Pub", Megaphone],
    ["Comptes publicitaires", BarChart3],
    ["Radar marché", Lightbulb],
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
      const nextAnalytics = analyticsResult?.snapshot ?? analytics ?? null;
      setSubscription(nextSubscription);
      if (analyticsResult?.snapshot) setAnalytics(analyticsResult.snapshot);
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
       if (nextAnalytics) setAnalytics(nextAnalytics);
       const cached = readCache<{ stores: StoreData[]; selectedStoreId: string | null; subscription: SubscriptionData | null; analytics: AnalyticsData }>(DASHBOARD_CACHE_KEY);
       writeCache(DASHBOARD_CACHE_KEY, { stores: cached?.stores ?? stores, selectedStoreId, subscription: cached?.subscription ?? subscription, analytics: nextAnalytics ?? cached?.analytics ?? analytics });
    })();
  }, [selectedStoreId]);

  return (
    <main className="app-shell">
      {active !== "Vendeo AI" ? (
        <header className="app-header">
          <Link href="/" className="brand">
            <Image className="brand-logo" src="/vendeo-logo-light.svg" alt="Vendeo" width={150} height={40} />
          </Link>
          <div className="app-user">
            <span className="app-greeting">Bonjour, {userName}</span>
             <button type="button" className={`mobile-more-trigger ${moreOpen || ["Rapports", "Mes boutiques", "Abonnement", "Paramètres"].includes(active) ? "active" : ""}`} aria-label="Plus d'options" onClick={() => setMoreOpen((open) => !open)}>
              <Settings size={18} />
            </button>
            <button className="desktop-signout" onClick={signOut} style={{ background: "transparent", border: 0, color: "#c7d2fe", fontSize: 11 }}>
              Déconnexion
            </button>
          </div>
        </header>
      ) : null}
      <div className={active === "Vendeo AI" ? "app-layout app-layout-flush" : "app-layout"}>
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
            onClick={() => setActive("Paramètres")}
          >
            <Settings size={16} />Paramètres
          </button>
          <div style={{ background: "linear-gradient(135deg,#ede9fe,#e0f2fe)", borderRadius: 10, margin: "35px 4px 0", padding: 14 }}>
            <span className="eyebrow" style={{ fontSize: 9 }}>
              {isActivePlan ? "Abonnement actif" : subscription?.status === "past_due" ? "Abonnement expiré" : "Essai gratuit"}
            </span>
            {isActivePlan ? <p style={{ fontSize: 11, lineHeight: 1.5, margin: "9px 0", color: "#334155" }}>Ton abonnement Vendeo est actif.</p> : <><p style={{ fontSize: 11, lineHeight: 1.5, margin: "9px 0", color: "#334155" }}>{subscription?.status === "past_due" ? "Ton abonnement a expiré. Réactive-le pour continuer." : "Choisis l’abonnement pour continuer après ton essai."}</p><button className="btn btn-dark" style={{ fontSize: 10, padding: "8px 10px", width: "100%" }} onClick={() => setActive("Abonnement")}>Voir l’abonnement</button></>}
          </div>

          <div className="side-usage">
            <div className="side-usage-label">Usage IA</div>
            <div className="side-usage-value">Accès illimité</div>
          </div>
        </aside>
        <section className={active === "Vendeo AI" ? "app-main chat-page" : "app-main"}>
          {loadingData ? (
            <div className="app-card">Chargement de ton espace…</div>
          ) : stores.length === 0 && !analytics && active !== "Mes boutiques" && active !== "Paramètres" && active !== "Abonnement" ? (
            <StoreOnboarding />
          ) : active === "Paramètres" ? (
            <MobileSettingsView onNavigate={setActive} onSignOut={signOut} plan={(subscription?.plan ?? "starter") as PlanId} />
          ) : active === "Vendeo AI" ? (
            <ChatView
              onGoToSubscription={() => setActive("Abonnement")}
              onUsageChange={(patch) =>
                setSubscription((prev) => (prev ? { ...prev, ...patch } : prev))
              }
              onBack={() => setActive(previousSection)}
              products={analytics?.products ?? []}
              analytics={analytics}
            />
          ) : active === "Studio" ? (
            <StudioView products={analytics?.products ?? []} />
          ) : active === "Pub" ? (
             <AdsView plan={(subscription?.plan ?? "starter") as PlanId} onGoToAI={() => setActive("Vendeo AI")} onGoToAccounts={() => setActive("Paramètres")} onLaunchAd={launchAd} storeId={stores[0]?.id ?? null} campaignsVersion={campaignsVersion} />
          ) : active === "Comptes publicitaires" ? (
             <MobileSettingsView onNavigate={setActive} onSignOut={signOut} plan={(subscription?.plan ?? "starter") as PlanId} />
          ) : active === "Radar marché" ? (
             <MarketRadarView onGoToAI={(prompt) => { sessionStorage.setItem(SESSION_STORAGE_PROMPT_KEY, prompt); setActive("Vendeo AI"); }} />
          ) : active === "Mes boutiques" ? (
            <StoresView stores={stores} subscription={subscription} onStoresChange={setStores} onBackToSettings={() => setActive("Paramètres")} />
          ) : active === "Abonnement" ? (
            <SubscriptionView subscription={subscription} onBackToSettings={() => setActive("Paramètres")} />
          ) : active === "Rapports" ? (
            <Reports stores={stores} analytics={analytics} selectedStoreId={selectedStoreId} />
          ) : (
            <Overview
              stores={stores}
              subscription={subscription}
              analytics={analytics}
              userFirstName={userFirstName}
              onGoToAI={() => setActive("Vendeo AI")}
              onGoToStores={() => setActive("Mes boutiques")}
              selectedStoreId={selectedStoreId}
              onStoreChange={setSelectedStoreId}
              onLaunchAd={launchAd}
              campaignsVersion={campaignsVersion}
            />
          )}
         </section>
         {wizardOpen && stores[0]?.id ? (
           <LaunchAdWizard
             storeId={stores[0].id}
             plan={(subscription?.plan ?? "starter") as PlanId}
             onClose={() => setWizardOpen(false)}
             onLaunched={() => setCampaignsVersion((v) => v + 1)}
           />
         ) : null}
      </div>

      <TrialPaywallModal subscription={subscription} />

        {active !== "Vendeo AI" ? (
         <nav className="mobile-nav" aria-label="Navigation mobile">
         <button type="button" className={`nav-btn ${active === "Vue d’ensemble" ? "active" : ""}`} onClick={() => setActive("Vue d’ensemble")}>
           <LayoutDashboard size={18} />
           <span>Accueil</span>
         </button>
           <button type="button" className={`nav-btn ${active === "Pub" ? "active" : ""}`} onClick={() => setActive("Pub")}>
             <Megaphone size={18} />
             <span>Pub</span>
          </button>
            <button type="button" className={`nav-btn ${active === "Studio" ? "active" : ""}`} onClick={() => setActive("Studio")}>
              <Sparkles size={21} strokeWidth={2.5} />
              <span>Studio</span>
            </button>
            <button type="button" className={`nav-btn ${active === "Vendeo AI" ? "active" : ""}`} onClick={() => setActive("Vendeo AI")}>
              <MessageSquare size={18} />
              <span>Assistant</span>
            </button>
            <button type="button" className={`nav-btn ${active === "Radar marché" ? "active" : ""}`} onClick={() => setActive("Radar marché")}>
              <Lightbulb size={18} />
              <span>Radar</span>
            </button>
        </nav>
        ) : null}
         {moreOpen ? <div className="mobile-more-menu" role="menu">
           <button type="button" onClick={() => { setActive("Rapports"); setMoreOpen(false); }}><FileText size={16} /> Rapports</button>
           <button type="button" onClick={() => { setActive("Mes boutiques"); setMoreOpen(false); }}><Store size={16} /> Boutiques Chariow</button>
          <button type="button" onClick={() => { setActive("Abonnement"); setMoreOpen(false); }}><CreditCard size={16} /> Abonnement</button>
           <button type="button" onClick={() => { setActive("Paramètres"); setMoreOpen(false); }}><Settings size={16} /> Paramètres</button>
           <button type="button" onClick={() => { setActive("Comptes publicitaires"); setMoreOpen(false); }}><BarChart3 size={16} /> Comptes publicitaires</button>
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

type StudioVideoJob = { id: string; status: string; contentUrl?: string | null };
type StudioHistoryItem = { id: string; kind: "image" | "video"; prompt: string; options: Record<string, string | number>; status: string; credits_cost: number; storage_path?: string | null; video_job_id?: string | null; mediaUrl?: string | null; created_at: string };

function StudioView({ products }: { products: Array<{ id: string; name: string; description?: string | null; price?: number | string | null; currency?: string | null; image?: string | null }> }) {
  const [kind, setKind] = useState<"image" | "video">("image");
  const [prompt, setPrompt] = useState("");
  const [imageMode, setImageMode] = useState<"fast" | "advanced">("fast");
  const [quality, setQuality] = useState("medium");
  const [imageResolution, setImageResolution] = useState("hd");
  const [orientation, setOrientation] = useState("square");
  const [background, setBackground] = useState("auto");
  const [duration, setDuration] = useState(5);
  const [videoResolution, setVideoResolution] = useState<"480p" | "768p">("480p");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoJob, setVideoJob] = useState<StudioVideoJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [balance, setBalance] = useState(0);
  const [creditAmount, setCreditAmount] = useState("200");
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [recharging, setRecharging] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<typeof products[number] | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [referenceMode, setReferenceMode] = useState<"image" | "reference">("reference");
  const [history, setHistory] = useState<StudioHistoryItem[]>([]);
  const [historyKind, setHistoryKind] = useState("all");
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedGenerationId, setSelectedGenerationId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editInstruction, setEditInstruction] = useState("");

  useEffect(() => {
    fetch("/api/studio/credits").then((response) => response.ok ? response.json() : null).then((data) => { if (data) setBalance(data.balance ?? 0); }).catch(() => undefined);
  }, []);

  async function loadHistory(reset = false) {
    setHistoryLoading(true);
    const params = new URLSearchParams();
    if (historyKind !== "all") params.set("kind", historyKind);
    if (!reset && historyCursor) params.set("cursor", historyCursor);
    const result = await fetch(`/api/studio/history?${params}`).then((response) => response.ok ? response.json() : null).catch(() => null);
    if (result) { setHistory((previous) => reset ? result.items : [...previous, ...result.items]); setHistoryCursor(result.nextCursor ?? null); }
    setHistoryLoading(false);
  }
  useEffect(() => { void loadHistory(true); }, [historyKind]);

  useEffect(() => {
    if (!videoJob || ["completed", "failed", "cancelled"].includes(videoJob.status)) return;
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/studio/video/${encodeURIComponent(videoJob.id)}`);
      const result = await response.json().catch(() => ({}));
      if (response.ok) setVideoJob(result);
      else if (result.error) setError(result.error);
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [videoJob]);

  async function generate() {
    if (!prompt.trim() && !selectedProduct) {
      setError(kind === "image" ? "Décris l'image que tu souhaites créer." : "Décris la vidéo que tu souhaites créer.");
      return;
    }
    setLoading(true);
    setError("");
    setImageUrl(null);
    if (kind === "video") setVideoJob(null);
    try {
      const response = await fetch(kind === "image" ? "/api/studio/image" : "/api/studio/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(kind === "image"
          ? { prompt, imageMode, quality, resolution: imageResolution, orientation, background, outputFormat: background === "transparent" ? "png" : "jpeg", product: selectedProduct ? { id: selectedProduct.id, name: selectedProduct.name, description: selectedProduct.description, price: selectedProduct.price ?? undefined, currency: selectedProduct.currency ?? undefined, imageUrl: selectedProduct.image ?? null } : undefined }
          : { prompt, duration, resolution: videoResolution, aspectRatio, referenceMode, product: selectedProduct ? { id: selectedProduct.id, name: selectedProduct.name, description: selectedProduct.description, price: selectedProduct.price ?? undefined, currency: selectedProduct.currency ?? undefined, imageUrl: selectedProduct.image ?? null } : undefined }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "La génération a échoué.");
      if (kind === "image") setImageUrl(result.imageUrl);
      if (kind === "image") setSelectedGenerationId(result.generationId);
      else setVideoJob({ id: result.jobId, status: result.status || "queued" });
      if (result.generationId) await loadHistory(true);
      const credits = await fetch("/api/studio/credits").then((response) => response.ok ? response.json() : null).catch(() => null);
      if (credits) setBalance(credits.balance ?? 0);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "La génération a échoué.");
    } finally {
      setLoading(false);
    }
  }

  async function recharge() {
    const credits = Number(creditAmount);
    if (!Number.isInteger(credits) || credits < 200) { setError("Le minimum de recharge est de 200 crédits."); return; }
    setRecharging(true);
    try {
      const response = await fetch("/api/studio/credits/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credits }) });
      const result = await response.json();
      if (!response.ok || !result.payment?.url) throw new Error(result.error || "Paiement indisponible.");
      window.location.href = result.payment.url;
    } catch (rechargeError) { setError(rechargeError instanceof Error ? rechargeError.message : "Paiement indisponible."); setRecharging(false); }
  }

  const rechargeCredits = Number(creditAmount);
  const rechargePrice = Number.isInteger(rechargeCredits) && rechargeCredits >= 200 ? Math.round(rechargeCredits * CREDIT_PRICE_XOF) : 0;

  async function editImage() {
    if (!selectedGenerationId || !editInstruction.trim()) return;
    setEditSubmitting(true); setError("");
    try {
      const response = await fetch("/api/studio/image/edit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generationId: selectedGenerationId, instruction: editInstruction }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Modification impossible.");
      setImageUrl(result.imageUrl); setSelectedGenerationId(result.generationId); setEditInstruction(""); setEditOpen(false); setHistoryCursor(null); await loadHistory(true);
      const credits = await fetch("/api/studio/credits").then((r) => r.ok ? r.json() : null).catch(() => null); if (credits) setBalance(credits.balance ?? 0);
    } catch (editError) { setError(editError instanceof Error ? editError.message : "Modification impossible."); } finally { setEditSubmitting(false); }
  }

  async function downloadMedia(url: string, filename: string) {
    try {
      if (typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
        const response = await fetch(url);
        const blob = await response.blob();
        const file = new File([blob], filename, { type: blob.type || (filename.endsWith(".mp4") ? "video/mp4" : "image/png") });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
          return;
        }
      }
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
    } catch (downloadError) {
      if ((downloadError as DOMException)?.name !== "AbortError") {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
      }
    }
  }

  const videoReady = videoJob?.status === "completed" && videoJob.contentUrl;

  return (
    <div className="studio-page">
      <div className="page-top studio-head">
        <div>
          <span className="eyebrow">Studio créatif</span>
          <h1>Crée tes médias avec l'IA</h1>
          <p>Génère une image ou une vidéo directement depuis Vendeo.</p>
        </div>
      </div>

      <div className="studio-tabs" role="tablist" aria-label="Type de média">
        <button type="button" role="tab" aria-selected={kind === "image"} className={kind === "image" ? "active" : ""} onClick={() => setKind("image")}><ImageIcon size={17} /> Image</button>
        <button type="button" role="tab" aria-selected={kind === "video"} className={kind === "video" ? "active" : ""} onClick={() => setKind("video")}><Video size={17} /> Vidéo</button>
      </div>
      <section className="studio-product-picker"><div className="studio-product-heading"><span className="eyebrow">Produit (optionnel)</span>{products.length > 6 ? <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Rechercher un produit" /> : null}</div>{products.length ? <div className="studio-product-list"><button type="button" className={!selectedProduct ? "selected" : ""} onClick={() => setSelectedProduct(null)}><Package size={18} /><span>Aucun produit</span></button>{products.filter((product) => !productSearch || product.name.toLowerCase().includes(productSearch.toLowerCase())).map((product) => <button type="button" key={product.id} className={selectedProduct?.id === product.id ? "selected" : ""} onClick={() => setSelectedProduct(product)}>{product.image ? <img src={product.image} alt="" /> : <Package size={18} />}<span>{product.name}</span><small>{product.price ? `${product.price} ${product.currency ?? ""}` : ""}</small></button>)}</div> : <small>Connecte ta boutique Chariow pour choisir un de tes produits. La création libre reste possible.</small>}{selectedProduct ? <div className="studio-product-chip">Produit choisi : {selectedProduct.name} <button type="button" onClick={() => setSelectedProduct(null)} aria-label="Retirer le produit">×</button>{selectedProduct.image && kind === "image" ? <em>Couverture du produit utilisée comme référence</em> : null}</div> : null}</section>
      <div className="studio-grid">
        <section className="app-card studio-form">
          <label className="studio-field">
            <span>Décris ta création</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={kind === "image" ? "Ex. Une photo éditoriale d'un sac artisanal sur un socle ocre, lumière naturelle douce, composition carrée." : "Ex. Une mise en scène cinématique d'un produit sur une table, travelling lent, ambiance chaleureuse, sons légers."} maxLength={4000} rows={7} />
            <small>{prompt.length}/4 000</small>
          </label>

          {kind === "image" ? (
            <div className="studio-options">
              <StudioSelect label="Mode" value={imageMode} onChange={(value) => setImageMode(value as "fast" | "advanced")} options={[['fast', 'Rapide'], ['advanced', 'Avancé']]} />
              <StudioSelect label="Qualité" value={quality} onChange={setQuality} options={[['medium', 'Moyenne'], ['high', 'Haute'], ['xhigh', 'Très haute'], ['max', 'Maximum']]} />
              <StudioSelect label="Résolution" value={imageResolution} onChange={setImageResolution} options={[['hd', 'HD'], ['full_hd', 'Full HD'], ['2k', '2K'], ['4k', '4K']]} />
              <StudioSelect label="Format" value={orientation} onChange={setOrientation} options={[['square', 'Carré'], ['landscape', 'Paysage'], ['portrait', 'Portrait']]} />
              <StudioSelect label="Fond" value={background} onChange={setBackground} options={[['auto', 'Auto'], ['opaque', 'Opaque'], ['transparent', 'Transparent PNG']]} />
              <div className="studio-suggestions">{["Affiche publicitaire", "Mockup 3D du livre", "Photo lifestyle", "Story verticale"].map((suggestion) => <button type="button" key={suggestion} onClick={() => { setPrompt(suggestion); if (suggestion === "Story verticale") setOrientation("portrait"); }}>{suggestion}</button>)}</div>
            </div>
          ) : (
            <div className="studio-options">
              <label className="studio-field"><span>Durée</span><select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>{[4, 5, 6, 8, 10, 12, 15, 20, 30, 40].map((value) => <option key={value} value={value}>{value} secondes</option>)}</select></label>
              <StudioSelect label="Résolution" value={videoResolution} onChange={(value) => setVideoResolution(value as "480p" | "768p")} options={[['480p', '480p'], ['768p', '768p']]} />
              <div className="studio-suggestions">{["Teaser de 5 secondes", "Présentation animée du livre", "Pub pour réseaux sociaux"].map((suggestion) => <button type="button" key={suggestion} onClick={() => { setPrompt(suggestion); if (suggestion === "Pub pour réseaux sociaux") setAspectRatio("9:16"); }}>{suggestion}</button>)}</div>
              {selectedProduct?.image ? <StudioSelect label="Utiliser la couverture comme" value={referenceMode} onChange={(value) => setReferenceMode(value as "image" | "reference")} options={[["reference", "Référence"], ["image", "Point de départ"]]} /> : null}
              <StudioSelect label="Format" value={aspectRatio} onChange={setAspectRatio} options={[['16:9', '16:9 paysage'], ['9:16', '9:16 vertical'], ['1:1', '1:1 carré'], ['4:3', '4:3'], ['3:4', '3:4'], ['21:9', '21:9 cinéma']]} />
            </div>
          )}

          {error ? <p className="form-error">{error}</p> : null}
          <button type="button" className="btn btn-dark studio-generate" onClick={() => void generate()} disabled={loading}>
            <Sparkles size={17} /> {loading ? "Création en cours…" : kind === "image" ? "Créer l'image" : "Créer la vidéo"}
          </button>
          <p className="studio-cost">{kind === "image" ? "Image : coût selon la qualité et la résolution choisies." : `Vidéo : ${videoResolution === "768p" ? "25" : "10"} cauris par seconde.`}</p>
          <div className="studio-balance"><div><span className="eyebrow">Solde Studio</span><strong>{balance} crédits</strong></div><button type="button" className="btn btn-ghost" onClick={() => setRechargeOpen(true)}>Recharger</button><small>Les crédits servent à générer et modifier tes médias.</small>{rechargeOpen ? <div className="studio-recharge-panel"><div><strong>Recharger des crédits</strong><button type="button" className="studio-recharge-close" onClick={() => setRechargeOpen(false)} aria-label="Fermer">×</button></div><label className="studio-field"><span>Quantité de crédits</span><input type="number" min="200" step="1" value={creditAmount} onChange={(event) => setCreditAmount(event.target.value)} autoFocus /></label><p>Prix : <strong>{rechargePrice ? `${rechargePrice.toLocaleString("fr-FR")} XOF` : "—"}</strong></p><small>Minimum 200 crédits · 1 crédit = 1,50 XOF</small><button type="button" className="btn btn-dark" onClick={() => void recharge()} disabled={recharging || !rechargePrice}>{recharging ? "Préparation du paiement…" : "Payer"}</button></div> : null}</div>
        </section>

        <section className="app-card studio-result" aria-busy={loading || editSubmitting || Boolean(videoJob && !["completed", "failed", "cancelled"].includes(videoJob.status))}>
          <div className="card-head"><div><span className="eyebrow">Résultat</span><h2>{kind === "image" ? "Ton image" : "Ta vidéo"}</h2></div>{kind === "image" ? <ImageIcon size={20} /> : <Video size={20} />}</div>
          {imageUrl ? <><div className={editSubmitting ? "studio-media-wrap is-editing" : "studio-media-wrap"}><img className="studio-media" src={imageUrl} alt="Image générée" decoding="async" /></div><div className="studio-result-actions"><button className="btn btn-ghost" onClick={() => void downloadMedia(imageUrl, "vendeo-studio-image.png")}>Télécharger l'image</button><button className="btn btn-ghost" onClick={() => setEditOpen(true)} disabled={editSubmitting}>Modifier</button></div>{editOpen ? <div className="studio-edit-box"><label><span>Décris la modification souhaitée</span><textarea maxLength={2000} value={editInstruction} onChange={(event) => setEditInstruction(event.target.value)} rows={3} disabled={editSubmitting} /></label><small>Coût : crédits de l'image d'origine</small><div><button className="btn btn-dark" onClick={() => void editImage()} disabled={editSubmitting || !editInstruction.trim()}>{editSubmitting ? "Modification…" : "Modifier"}</button><button className="btn btn-ghost" onClick={() => { setEditOpen(false); setEditInstruction(""); }} disabled={editSubmitting}>Annuler</button></div></div> : null}</> : null}
          {videoReady ? <><video className="studio-media" src={videoJob.contentUrl ?? undefined} controls playsInline /><a className="btn btn-ghost" href={videoJob.contentUrl ?? undefined} download="vendeo-studio-video.mp4">Télécharger la vidéo</a></> : null}
          {!imageUrl && !videoReady ? <div className={loading || videoJob ? "studio-empty studio-loading" : "studio-empty"}>{loading || videoJob ? <><Sparkles size={32} /><strong>Génération en cours…</strong><p>{videoJob ? `Statut : ${videoJob.status}. La vidéo peut prendre quelques minutes.` : "Encore quelques secondes…"}</p></> : <><Sparkles size={32} /><strong>Prêt à créer</strong><p>Décris ton idée, ajuste les réglages puis lance la génération.</p></>}</div> : null}
        </section>
      </div>
      <div className="studio-history-toolbar"><span className="eyebrow">Historique</span><div><button className={historyKind === "all" ? "active" : ""} onClick={() => setHistoryKind("all")}>Tout</button><button className={historyKind === "image" ? "active" : ""} onClick={() => setHistoryKind("image")}>Images</button><button className={historyKind === "video" ? "active" : ""} onClick={() => setHistoryKind("video")}>Vidéos</button></div></div>
      <section className="studio-history">{history.length ? history.map((item) => <article className="studio-history-card" key={item.id} onClick={() => { setSelectedGenerationId(item.id); setKind(item.kind); if (item.kind === "image") setImageUrl(item.mediaUrl ?? null); else if (item.video_job_id) setVideoJob({ id: item.video_job_id, status: item.status, contentUrl: item.mediaUrl }); }}><div className={`studio-history-thumb ${item.status === "processing" ? "is-loading" : ""}`}>{item.mediaUrl && item.kind === "image" ? <img src={item.mediaUrl} alt="Création" loading="lazy" decoding="async" /> : item.kind === "video" ? <Video size={22} /> : <Sparkles size={22} />}</div><div className="studio-history-copy"><strong>{item.kind === "image" ? "Image" : "Vidéo"}</strong><p>{item.prompt.slice(0, 90)}{item.prompt.length > 90 ? "…" : ""}</p><small>{new Date(item.created_at).toLocaleString("fr-FR")} · {item.credits_cost} crédits · {item.status === "processing" ? "En cours" : item.status === "failed" ? "Échec" : "Terminée"}</small></div><div className="studio-history-actions"><button onClick={(event) => { event.stopPropagation(); setPrompt(item.prompt); }}>Réutiliser</button>{item.kind === "image" ? <button onClick={(event) => { event.stopPropagation(); setSelectedGenerationId(item.id); setImageUrl(item.mediaUrl ?? null); setEditOpen(true); }}>Modifier</button> : null}<button onClick={async (event) => { event.stopPropagation(); if (!window.confirm("Supprimer cette création ?")) return; await fetch(`/api/studio/history/${item.id}`, { method: "DELETE" }); await loadHistory(true); }}>Supprimer</button></div></article>) : <div className="studio-history-empty">Aucune création pour l'instant</div>}{historyCursor ? <button className="btn btn-ghost studio-load-more" onClick={() => void loadHistory()} disabled={historyLoading}>{historyLoading ? "Chargement…" : "Charger plus"}</button> : null}</section>
    </div>
  );
}

function StudioSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="studio-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

function Overview({
  stores,
  subscription,
  analytics,
  userFirstName,
  onGoToAI,
  onGoToStores,
  selectedStoreId,
  onStoreChange,
  onLaunchAd,
  campaignsVersion,
}: {
  stores: StoreData[];
  subscription: SubscriptionData | null;
  analytics: AnalyticsData;
  userFirstName: string;
  onGoToAI: () => void;
  onGoToStores: () => void;
  selectedStoreId: string | null;
  onStoreChange: (storeId: string) => void;
  onLaunchAd: () => void;
  campaignsVersion: number;
}) {
  const openAI = (prompt: string) => {
    sessionStorage.setItem(SESSION_STORAGE_PROMPT_KEY, prompt);
    onGoToAI();
  };
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
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Avant : on vérifiait juste si Meta était connecté, sans jamais récupérer
  // les performances. Résultat : la carte "Recommandations" restait vide en
  // permanence sur la Vue d'ensemble. On récupère maintenant les vraies données.
  const refresh = async () => {
    setRefreshing(true);
    try {
      const accountsResponse = await fetch("/api/integrations/meta/accounts");
      const accountsData = accountsResponse.ok ? await accountsResponse.json() : { accounts: [] };
      const accounts = accountsData.accounts ?? [];
      setMetaConnected(accounts.length > 0);
      if (accounts[0]) {
        const metrics = await fetch(`/api/meta/performance?account_id=${encodeURIComponent(accounts[0].id)}`);
        if (metrics.ok) setMetaPerformance(await metrics.json());
      } else {
        setMetaPerformance(null);
      }
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => { void refresh(); }, [campaignsVersion]);

  const spend = metaPerformance?.overview.spend ?? 0;
  const roas = metaPerformance?.overview.realRoas ?? metaPerformance?.overview.metaRoas ?? null;
  const performances = metaPerformance?.performances ?? [];
  const adsCurrency = metaPerformance?.currency ?? currency;

  const statusText = !connected
    ? "Connecte ta boutique Chariow pour commencer l’analyse."
    : !metaConnected
    ? "Ta boutique est connectée. Connecte Meta Ads pour relier tes dépenses à tes ventes."
    : sales === 0 && spend > 0
    ? "Les dépenses Meta ne produisent pas encore de vente confirmée."
    : sales === 0
    ? "Aucune vente confirmée sur la période. Commence par observer ton trafic et tes campagnes."
    : "Ton activité est suivie. Voici ce que Vendeo recommande de faire maintenant.";

  const productsRanked = [...products].sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0));
  const productsSummary = productsRanked.slice(0, 3).map((product, index) => {
    const productSales = product.sales ?? 0;
    // Cette étiquette décrit uniquement les ventes Chariow du produit — elle ne dit
    // rien sur une pub, qui peut ne même pas exister pour ce produit. On évite donc
    // tout vocabulaire de verdict publicitaire ("Arrêter"/"Optimiser") ici : ce
    // langage n'a de sens que sur une campagne, pas sur une fiche produit.
    const state = productSales === 0
      ? { label: "Aucune vente", tone: "none" as const }
      : index === 0
      ? { label: "Meilleure vente", tone: "optimize" as const }
      : { label: "En progression", tone: "watch" as const };
    return { name: product.name, sales: productSales, revenue: productSales ? Number(product.price ?? 0) * productSales : 0, image: product.image, state };
  });


  // --- Refonte dashboard : verdict global, tableau croisé, diagnostic boutique ---
  // Ces trois blocs réutilisent le même moteur de décision (getCampaignVerdict, plus
  // bas dans ce fichier) que les pages "Pubs" et "Rapports", pour rester cohérents
  // avec les verdicts déjà affichés ailleurs plutôt que d'inventer une seconde logique.
  const withVerdict = performances.map((campaign) => ({ campaign, verdict: getCampaignVerdict(campaign, adsCurrency) }));

  const verdictData: VerdictBannerData = (() => {
    const stopEntries = withVerdict.filter((item) => item.verdict.tone === "stop");
    if (stopEntries.length > 0) {
      const worst = stopEntries.reduce((a, b) => (b.campaign.spend > a.campaign.spend ? b : a));
      return { verdict: "stop", campaignName: worst.campaign.name, spend: worst.campaign.spend, activeCampaignsCount: stopEntries.length };
    }
    const scaleEntries = withVerdict.filter((item) => item.verdict.tone === "optimize" && (item.campaign.roas ?? 0) >= 1);
    if (scaleEntries.length > 0) {
      const best = scaleEntries.reduce((a, b) => (b.campaign.roas ?? 0) > (a.campaign.roas ?? 0) ? b : a);
      const suggestedIncrease = Math.max(2000, Math.round((best.campaign.spend * 0.2) / 1000) * 1000);
      return {
        verdict: "scale",
        bestCampaignName: best.campaign.name,
        roas: best.campaign.roas ?? 0,
        suggestedBudgetIncrease: suggestedIncrease,
        estimatedExtraSales: Math.max(1, Math.round((best.campaign.conversions || 0) * 0.2)),
      };
    }
    return { verdict: "stable", activeCampaignsCount: performances.length };
  })();

  const budgetEconomise = withVerdict.filter((item) => item.verdict.tone === "stop").reduce((sum, item) => sum + item.campaign.spend, 0);
  const revenuAdditionnelEstime = Math.round(
    withVerdict
      .filter((item) => item.verdict.tone === "optimize")
      .reduce((sum, item) => sum + item.campaign.spend * 0.2 * (item.campaign.roas ?? 1), 0)
  );

  // Pas encore d'attribution campagne → produit branchée ici (cf. lib/attribution) :
  // on affiche donc le nom de campagne et les métriques réelles, sans inventer un
  // produit ou une audience que Vendeo ne connaît pas encore pour cette campagne.
  const campaignRows: CampaignRow[] = performances.map((campaign) => {
    const verdict = getCampaignVerdict(campaign, adsCurrency);
    const badge: CampaignVerdictBadge = verdict.tone === "stop" ? "stop" : verdict.tone === "optimize" ? "scale" : "test";
    return {
      id: campaign.id,
      campaignName: campaign.name,
      productName: "",
      audienceTags: [],
      network: "meta",
      spend: campaign.spend,
      realSales: campaign.conversions,
      realRevenue: campaign.roas !== null ? Math.round(campaign.spend * campaign.roas) : 0,
      verdict: badge,
      recommendedAction: verdict.action,
    };
  });

  // Diagnostic boutique : s'appuie sur les ventes déjà confirmées par Chariow pour ce
  // produit (mêmes données que "Produits les plus performants" ci-dessous). On reste
  // volontairement prudent — pas de calcul d'abandon de panier ici, contrairement au
  // moteur complet de lib/pricing.ts — donc le texte évite d'affirmer "sans abandon".
  const topProduct = productsRanked[0];
  const diagnosticCards: DiagnosticCard[] =
    topProduct && (topProduct.sales ?? 0) >= 2
      ? [
          {
            id: `price-${topProduct.name}`,
            type: "price_up",
            title: "Ajustement de prix",
            description: `« ${topProduct.name} » a déjà ${topProduct.sales} vente${(topProduct.sales ?? 0) > 1 ? "s" : ""} confirmée${(topProduct.sales ?? 0) > 1 ? "s" : ""} sur Chariow. Demande à Vendeo AI si une légère hausse de prix est jouable sans perdre de volume.`,
            actionLabel: "Demander à Vendeo AI",
            onAction: () => openAI(`Le produit "${topProduct.name}" a ${topProduct.sales} ventes confirmées. Est-ce que je peux augmenter son prix sans perdre de volume ?`),
          },
        ]
      : [];

  return (
    <div className="dashboard-home">
      <div className="home-greeting"><h1>Bonjour, {greeting}</h1><p>Voici la performance de tes publicités et de ta boutique.</p></div>

      <div className="home-header">
        <div className="home-context"><span className="eyebrow">Vue d’ensemble</span></div>
        <div className="home-controls">
          <label className="home-store-selector">
            <span>Boutique analysée</span>
            <select aria-label="Boutique analysée" value={selectedStoreId ?? ""} disabled={!stores.length} onChange={(event) => onStoreChange(event.target.value)}>
              {!stores.length && <option value="">Aucune boutique</option>}
              {stores.map((item) => <option key={item.id} value={item.id}>{item.store_name}</option>)}
            </select>
          </label>
          <div className="home-statuses">
            <span className={connected ? "status-positive" : "status-warning"}>{connected ? "Chariow connectée" : "Chariow non connectée"}</span>
            <span className={metaConnected ? "status-positive" : "status-info"}>{metaConnected ? "Meta Ads connectée" : "Meta Ads non connectée"}</span>
          </div>
          <div className="home-period">
            <span>Période</span>
            <select aria-label="Période" value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option>Aujourd’hui</option><option>Hier</option><option>7 derniers jours</option><option>30 derniers jours</option><option>Ce mois-ci</option><option>Mois dernier</option><option>Personnalisé</option>
            </select>
          </div>
          {period === "Personnalisé" ? <>
            <input aria-label="Date de début" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} />
            <input aria-label="Date de fin" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} />
          </> : null}
          <button className="btn btn-ghost" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? "Actualisation…" : "Actualiser"}</button>
        </div>
      </div>

      <LaunchAdBar onLaunch={onLaunchAd} />

      <VerdictBanner
        data={verdictData}
        onPrimaryAction={() => openAI("Analyse mes campagnes et dis-moi précisément quoi arrêter ou scaler en priorité.")}
        onSecondaryAction={() => openAI("Explique-moi pourquoi ce verdict et ce que je risque si je ne fais rien.")}
      />

      <ImpactFinancierCard data={{ budgetEconomise, revenuAdditionnelEstime }} />

      <section className="home-ai-state app-card"><div><span className="eyebrow">Analyse IA</span><h2>État de votre activité</h2><p>{statusText}</p></div><Brain size={24} /></section>

      <section className="home-kpis">
        <HomeKpi label="Chiffre d’affaires" value={connected ? format(revenue) : "Non disponible"} tone={revenue > 0 ? "positive" : "neutral"} help="Revenu commercial remonté par Chariow." />
        <HomeKpi label="Dépenses pub" value={metaConnected ? format(spend) : "Non disponible"} tone="info" help="Dépenses synchronisées depuis Meta Insights." />
        <HomeKpi label="Ventes" value={connected ? String(sales) : "Non disponible"} tone={sales > 0 ? "positive" : "neutral"} help="Paiements confirmés par Chariow." />
        <HomeKpi label="ROAS (réel)" value={roas === null ? "Non disponible" : `${roas.toFixed(2)}x`} tone={roas !== null && roas >= 1 ? "positive" : "info"} help="Revenu Chariow attribué divisé par les dépenses publicitaires." />
      </section>

      <div className="home-primary-grid">
        <div className="app-card reco-card-wrapper">
          <div className="reco-card-head-row">
            <span className="eyebrow">Recommandations Vendeo</span>
            <h2 style={{ margin: "4px 0 0", fontSize: 17 }}>Que faire maintenant ?</h2>
          </div>
          <AdsDecisionSummary performances={performances} currency={adsCurrency} onOpenAI={openAI} compact />
        </div>
        <div className="home-side-stack">
          <AdsSavingsSummary performances={performances} currency={adsCurrency} />
        </div>
      </div>

      {performances.length > 0 ? <CampaignCrossTable rows={campaignRows} /> : null}

      {diagnosticCards.length > 0 ? <DiagnosticBoutique cards={diagnosticCards} /> : null}

      <section className="app-card product-perf-section">
        <div className="card-head"><h2>Produits les plus performants</h2></div>
        {productsSummary.length ? (
          <div className="product-perf-list">
            {productsSummary.map((product) => (
              <div className="product-perf-row" key={product.name}>
                <div className="product-perf-image">{product.image ? <img src={product.image} alt="" /> : <Package size={18} />}</div>
                <div className="product-perf-info">
                  <strong className="product-perf-name">{product.name}</strong>
                  <span className={`product-perf-badge product-perf-badge-${product.state.tone}`}>{product.state.label}</span>
                </div>
                <div className="product-perf-stats">
                  <div><small>Ventes</small><strong>{product.sales}</strong></div>
                  <div><small>CA</small><strong>{format(product.revenue)}</strong></div>
                </div>
              </div>
            ))}
          </div>
        ) : <EmptyState title="Aucun produit avec des ventes" text="Les produits apparaîtront ici une fois des ventes confirmées." />}
      </section>

      <section className="home-chart app-card">
        <div className="card-head"><div><span className="eyebrow">Tendance</span><h2>Évolution du chiffre d’affaires</h2><p>Ventes des 7 derniers jours, par produit.</p></div><LineChart size={19} /></div>
        {!connected ? <EmptyState title="Données indisponibles" text="Connecte ta boutique Chariow pour afficher l’évolution." /> : <RealTrendChart sales={analytics?.sales ?? []} products={products} currency={currency} />}
      </section>

      <section className="home-activity app-card">
        <div className="card-head"><div><span className="eyebrow">Chariow</span><h2>Activité récente</h2><p>Les derniers événements remontés par ta boutique.</p></div><Activity size={19} /></div>
        {analytics?.sales?.length ? <ul className="activity">{analytics.sales.slice(0, 5).map((sale, index) => <RecentSale key={index} sale={sale} currency={currency} />)}</ul> : <EmptyState title="Aucune vente récente" text="Les ventes et statuts Chariow apparaîtront ici lorsqu’ils seront synchronisés." />}
      </section>

    </div>
  );
}

function HomeKpi({ label, value, help, tone, action }: { label: string; value: string; help: string; tone: string; action?: () => void }) { return <div className={`home-kpi ${tone}`}><small>{label}</small><strong>{value}</strong><span>{help}</span>{action ? <button className="btn btn-ghost" onClick={action}>Configurer</button> : null}</div>; }

function MarketRadarView({ onGoToAI }: { onGoToAI: (prompt: string) => void }) {
  const [idea, setIdea] = useState("");
  const [selectedCountries, setSelectedCountries] = useState(["BJ"]);
  const [audience, setAudience] = useState("entrepreneurs");
  const [format, setFormat] = useState("ebook");
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const countryOptions = [
    ["DZ", "Algérie"], ["AO", "Angola"], ["BJ", "Bénin"], ["BW", "Botswana"], ["BF", "Burkina Faso"], ["BI", "Burundi"], ["CV", "Cap-Vert"], ["CM", "Cameroun"], ["CF", "Centrafrique"], ["TD", "Tchad"], ["KM", "Comores"], ["CG", "Congo"], ["CD", "RDC"], ["CI", "Côte d’Ivoire"], ["DJ", "Djibouti"], ["EG", "Égypte"], ["GQ", "Guinée équatoriale"], ["ER", "Érythrée"], ["SZ", "Eswatini"], ["ET", "Éthiopie"], ["GA", "Gabon"], ["GM", "Gambie"], ["GH", "Ghana"], ["GN", "Guinée"], ["GW", "Guinée-Bissau"], ["KE", "Kenya"], ["LS", "Lesotho"], ["LR", "Liberia"], ["LY", "Libye"], ["MG", "Madagascar"], ["MW", "Malawi"], ["ML", "Mali"], ["MR", "Mauritanie"], ["MU", "Maurice"], ["MA", "Maroc"], ["MZ", "Mozambique"], ["NA", "Namibie"], ["NE", "Niger"], ["NG", "Nigeria"], ["RW", "Rwanda"], ["ST", "Sao Tomé-et-Principe"], ["SN", "Sénégal"], ["SC", "Seychelles"], ["SL", "Sierra Leone"], ["SO", "Somalie"], ["ZA", "Afrique du Sud"], ["SS", "Soudan du Sud"], ["SD", "Soudan"], ["TZ", "Tanzanie"], ["TG", "Togo"], ["TN", "Tunisie"], ["UG", "Ouganda"], ["ZM", "Zambie"], ["ZW", "Zimbabwe"],
  ] as const;
  function toggleCountry(code: string) { setSelectedCountries((selected) => selected.includes(code) ? selected.filter((country) => country !== code) : selected.length < 5 ? [...selected, code] : selected); }

  async function analyze(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/market/radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idea, countries: selectedCountries, audience, format }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Analyse impossible."); return; }
      setReport(data.report ?? null);
    } catch { setError("Le radar marché est momentanément indisponible."); } finally { setLoading(false); }
  }

  const dimensions = (report?.dimensions ?? {}) as Record<string, number>;
  const ideas = Array.isArray(report?.ideas) ? report.ideas as Array<Record<string, unknown>> : [];
  return <div className="market-radar-page">
    <div className="page-top"><div><span className="eyebrow">Axe 3 · Sourcing</span><h1>Radar marché</h1><p>Teste une idée de produit digital avant de passer du temps à la produire.</p></div></div>
    <section className="market-radar-hero"><div><span className="eyebrow">Validation en temps réel</span><h2>Quelle idée veux-tu lancer ?</h2><p>Vendeo mesure les signaux de recherche disponibles et transforme ton idée en concept d’e-book exploitable.</p><label className="market-idea-input"><span>Idée à analyser</span><input value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="Ex : ebook pour gérer son argent avec Mobile Money" /></label></div><TrendingUp size={32} /></section>
    <form className="app-card market-radar-form" onSubmit={analyze}>
      <div className="market-radar-fields"><fieldset className="market-country-picker"><legend>Pays à analyser <small>{selectedCountries.length}/5 sélectionnés</small></legend><div>{countryOptions.map(([code, name]) => <label key={code}><input type="checkbox" checked={selectedCountries.includes(code)} onChange={() => toggleCountry(code)} disabled={!selectedCountries.includes(code) && selectedCountries.length >= 5} /><span>{name}</span></label>)}</div></fieldset><label>Audience<select value={audience} onChange={(event) => setAudience(event.target.value)}><option value="entrepreneurs">Entrepreneurs et indépendants</option><option value="jeunes actifs">Jeunes actifs</option><option value="étudiants">Étudiants</option><option value="femmes entrepreneures">Femmes entrepreneures</option><option value="créateurs de contenu">Créateurs de contenu</option><option value="vendeurs en ligne">Vendeurs en ligne</option><option value="petites entreprises">Petites entreprises</option></select></label><label>Format<select value={format} onChange={(event) => setFormat(event.target.value)}><option value="ebook">E-book</option><option value="formation">Formation</option><option value="template">Templates</option><option value="abonnement">Abonnement</option></select></label></div>
      {error && <p className="store-error">{error}</p>}<button className="btn btn-dark" disabled={loading || idea.trim().length < 8}>{loading ? "Analyse des signaux…" : "Analyser le potentiel"}</button>
    </form>
    {report ? <>
      <section className="market-radar-score"><div><span className="eyebrow">Potentiel estimé</span><strong>{String(report.score ?? 0)}<small>/100</small></strong><p>Confiance {String(report.confidence ?? "low")} · {Array.isArray(report.liveSources) && report.liveSources.length ? String(report.liveSources.join(", ")) : "Aucune source live configurée"}</p></div><div><div className="market-dimension-grid">{[["Demande","demand"],["Croissance","growth"],["Concurrence","competition"],["Adéquation pays","countryFit"],["Monétisation","monetization"]].map(([label,key]) => <div key={key}><small>{label}</small><strong>{dimensions[key] ?? 0}</strong><i><b style={{ width: `${dimensions[key] ?? 0}%` }} /></i></div>)}</div><div className="market-trend"><span>Signal récent</span><strong>{String((report.trend as Record<string, unknown>)?.current ?? 0)} <small>{(report.trend as Record<string, unknown>)?.direction === "up" ? "↗ en hausse" : (report.trend as Record<string, unknown>)?.direction === "down" ? "↘ en baisse" : "→ stable"}</small></strong><div>{((report.trend as Record<string, unknown>)?.points as number[] ?? []).map((point, index) => <i key={`${point}-${index}`} style={{ height: `${Math.max(8, point)}%` }} />)}</div></div></div></section>
      <section className="market-evidence-grid"><div className="app-card"><div className="card-head"><div><span className="eyebrow">Preuves</span><h2>Pourquoi ce score ?</h2></div><Activity size={18} /></div>{(report.evidence as Array<Record<string, string>> ?? []).map((item) => <div className="market-evidence" key={`${item.label}-${item.value}`}><small>{item.label}</small><strong>{item.value}</strong></div>)}</div><div className="app-card"><div className="card-head"><div><span className="eyebrow">Décision</span><h2>Risques à connaître</h2></div><ShieldAlert size={18} /></div>{(report.risks as string[] ?? []).map((risk) => <p className="market-risk" key={risk}>{risk}</p>)}<p className="market-price">Prix de test: {String((report.recommendedPrice as Record<string, unknown>)?.min)} à {String((report.recommendedPrice as Record<string, unknown>)?.max)} XOF</p></div></section>
      <section className="app-card market-ideas"><div className="card-head"><div><span className="eyebrow">Concepts exploitables</span><h2>Ce que tu peux lancer</h2></div><Lightbulb size={18} /></div>{ideas.map((item) => <article className="market-idea" key={String(item.title)}><div><h3>{String(item.title)}</h3><p>{String(item.promise)}</p><small>Pour: {String(item.audience)}</small></div><button className="btn btn-ghost" onClick={() => onGoToAI(`Développe le concept d'e-book « ${String(item.title)} » avec un plan détaillé, une promesse commerciale et un upsell adapté aux marchés ${selectedCountries.join(", ")}.`)}>Développer avec l’IA</button></article>)}</section>
    </> : <div className="app-card market-empty"><Lightbulb size={24} /><strong>Entre une idée pour obtenir un score de potentialité</strong><span>Le score indique la force des signaux disponibles. Il ne garantit pas les ventes.</span></div>}
  </div>;
}
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

const STACK_DAYS = 7;
const STACK_COLORS = ["#4c21f6", "#029bfc", "#43a765", "#f5a524"];
const STACK_OTHERS_COLOR = "#94a3b8";
const stackCompact = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
type StackSeries = { key: string; label: string; color: string };
function stackRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stackDayKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function stackSaleDay(raw: unknown): string | null { if (typeof raw !== "string" || !raw) return null; if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; const date = new Date(raw); return Number.isNaN(date.getTime()) ? null : stackDayKey(date); }
function stackAmount(raw: unknown): number { const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>).value : raw; const parsed = typeof source === "number" ? source : typeof source === "string" ? Number(source.replace(/[^\d.,-]/g, "").replace(",", ".")) : 0; return Number.isFinite(parsed) ? parsed : 0; }
function stackScale(maxValue: number) { const rough = Math.max(maxValue, 1) / 4; const magnitude = 10 ** Math.floor(Math.log10(rough)); const residual = rough / magnitude; const factor = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10; const step = factor * magnitude; return { step, max: Math.ceil(Math.max(maxValue, 1) / step) * step }; }
function RealTrendChart({ sales, products, currency }: { sales: unknown[]; products: Array<{ id: string; name: string }>; currency: string }) {
  const [active, setActive] = useState<number | null>(null); const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (event: PointerEvent) => { if (rootRef.current && !rootRef.current.contains(event.target as Node)) setActive(null); }; document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close); }, []);
  const chart = useMemo(() => {
    const days = Array.from({ length: STACK_DAYS }, (_, index) => { const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - (STACK_DAYS - 1 - index)); return { key: stackDayKey(date), weekday: date.toLocaleDateString("fr-FR", { weekday: "short" }), num: String(date.getDate()), long: date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) }; });
    const dayIndex = new Map(days.map((day, index) => [day.key, index] as const)); const names = new Map(products.map((product) => [String(product.id), product.name] as const)); const perProduct = new Map<string, { label: string; total: number; days: number[] }>();
    for (const item of sales) { const row = stackRecord(item); const status = row.status ?? row.state; if (status !== "completed" && status !== "settled") continue; const index = stackSaleDay(row.created_at ?? row.createdAt ?? row.occurred_at); const dayPos = index ? dayIndex.get(index) : undefined; if (dayPos === undefined) continue; const product = stackRecord(row.product); const rawId = row.product_id ?? product.id ?? product.uuid; const id = rawId === undefined || rawId === null ? "" : String(rawId); const label = (id && names.get(id)) || String(row.product_name ?? product.name ?? product.title ?? "") || "Produit"; const key = id || label; const amount = stackAmount(row.amount); const entry = perProduct.get(key) ?? { label, total: 0, days: new Array<number>(STACK_DAYS).fill(0) }; entry.days[dayPos] += amount; entry.total += amount; perProduct.set(key, entry); }
    const ranked = Array.from(perProduct.entries()).sort((a, b) => b[1].total - a[1].total); const top = ranked.slice(0, STACK_COLORS.length); const rest = ranked.slice(STACK_COLORS.length); const series: StackSeries[] = top.map(([key, entry], index) => ({ key, label: entry.label, color: STACK_COLORS[index] })); const matrix: number[][] = days.map((_, dayPos) => top.map(([, entry]) => entry.days[dayPos])); if (rest.length) { series.push({ key: "__others", label: "Autres", color: STACK_OTHERS_COLOR }); matrix.forEach((row, dayPos) => row.push(rest.reduce((sum, [, entry]) => sum + entry.days[dayPos], 0))); } const dayTotals = matrix.map((row) => row.reduce((sum, value) => sum + value, 0)); const grand = dayTotals.reduce((sum, value) => sum + value, 0); const scale = stackScale(Math.max(...dayTotals)); const ticks = Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, index) => index * scale.step); return { days, series, matrix, dayTotals, grand, scale, ticks };
  }, [sales, products]);
  const money = (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} ${currency}`;
  if (!chart.grand) return <EmptyState title="Aucune vente sur 7 jours" text="Les ventes confirmées des 7 derniers jours apparaîtront ici, empilées par produit." />;
  return <div className="stack-chart" ref={rootRef} role="group" aria-label={`Chiffre d’affaires des 7 derniers jours par produit, total ${money(chart.grand)}`}><ul className="stack-legend">{chart.series.map((item) => <li key={item.key}><i style={{ background: item.color }} /><span>{item.label}</span></li>)}</ul><div className="stack-body"><div className="stack-y" aria-hidden="true">{chart.ticks.map((tick) => <span key={tick} style={{ bottom: `${(tick / chart.scale.max) * 100}%` }}>{stackCompact.format(tick)}</span>)}</div><div className="stack-plot">{chart.ticks.map((tick) => <i key={tick} className="stack-grid" aria-hidden="true" style={{ bottom: `${(tick / chart.scale.max) * 100}%` }} />)}<div className="stack-cols">{chart.days.map((day, index) => { const total = chart.dayTotals[index]; return <button type="button" key={day.key} className={`stack-col${active === index ? " active" : ""}`} aria-label={`${day.long} : ${money(total)}`} onPointerEnter={(event) => { if (event.pointerType === "mouse") setActive(index); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") setActive(null); }} onClick={(event) => { if ((event.nativeEvent as PointerEvent).pointerType === "mouse") return; setActive((current) => current === index ? null : index); }}><span className="stack-bar" style={{ height: `${(total / chart.scale.max) * 100}%` }}>{chart.series.map((item, seriesIndex) => { const value = chart.matrix[index][seriesIndex]; return value > 0 ? <span key={item.key} className="stack-seg" style={{ height: `${(value / total) * 100}%`, background: item.color }} /> : null; })}</span></button>; })}</div>{active !== null ? <div className="stack-tip" style={{ left: `${((active + 0.5) / STACK_DAYS) * 100}%`, transform: `translateX(${active <= 1 ? "-20%" : active >= STACK_DAYS - 2 ? "-80%" : "-50%"})` }}><strong>{chart.days[active].long}</strong>{chart.dayTotals[active] > 0 ? <>{chart.series.map((item, seriesIndex) => { const value = chart.matrix[active][seriesIndex]; return value > 0 ? <span key={item.key}><i style={{ background: item.color }} />{item.label}<b>{money(value)}</b></span> : null; })}<em>Total {money(chart.dayTotals[active])}</em></> : <span>Aucune vente</span>}</div> : null}</div></div><div className="stack-x" aria-hidden="true">{chart.days.map((day) => <span key={day.key}><b>{day.weekday}</b><small>{day.num}</small></span>)}</div><div className="stack-foot"><span className="stack-unit">Montants en {currency}</span><span className="chart-total">Total : {money(chart.grand)}</span></div></div>;
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
  const rec = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
  const row = rec(sale);
  const status = String(row.status ?? row.state ?? "unknown");
  const label = status === "completed" ? "Vente réussie" : status === "awaiting_payment" ? "Paiement en attente" : status === "failed" ? "Paiement échoué" : status === "abandoned" ? "Vente abandonnée" : status === "refunded" ? "Remboursement" : status === "settled" ? "Vente réglée" : status;
  const saleCurrency = String(rec(row.amount).currency ?? currency);
  const amount = Number(rec(row.amount).value ?? row.amount ?? 0) || 0;
  const date = row.created_at ?? row.createdAt ?? row.occurred_at;
  const customer = rec(row.customer);
  const payment = rec(row.payment);
  const context = rec(row.context);
  const settlement = rec(row.settlement);
  const discountInfo = rec(row.discount);
  const failure = rec(payment.failure_error);
  const legacyError = rec(row.error);
  const money = (value: unknown): string | null => { if (value === null || value === undefined) return null; const numeric = Number(rec(value).value ?? value); if (!Number.isFinite(numeric) || numeric <= 0) return null; return `${numeric.toLocaleString("fr-FR")} ${String(rec(value).currency ?? saleCurrency)}`; };
  const phone = displayPhone(customer.phone ?? row.phone ?? customer.phone_number ?? row.phone_number);
  const customerName = displayValue(customer.name) ?? ([customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Non fourni");
  const productName = String(row.product_name ?? rec(row.product).name ?? "Produit Chariow");
  const price = money(row.original_amount ?? row.price ?? payment.price ?? row.amount);
  const netAmount = money(row.amount ?? row.net_amount ?? row.netAmount ?? payment.net_amount);
  const discountAmount = money(row.discount_amount);
  const discountCode = displayValue(discountInfo.code ?? discountInfo.name);
  const discountText = discountAmount ? (discountCode ? `${discountAmount} (${discountCode})` : discountAmount) : (discountCode ?? "Aucune");
  const payoutAmount = money(settlement.amount);
  const serviceFee = money(settlement.service_fee);
  const paymentMethod = displayValue(rec(payment.method).name) ?? displayValue(payment.gateway);
  const channelLabel = displayValue(rec(row.channel).label ?? row.channel);
  const campaignName = displayValue(rec(row.campaign).name);
  const source = [channelLabel, campaignName].filter(Boolean).join(" · ") || displayValue(row.source ?? payment.source) || "Non fourni";
  const shop = displayValue(row.store_name ?? row.store ?? row.shop) ?? "Non fourni";
  const country = displayValue(row.country ?? context.country ?? rec(row.shipping).country ?? customer.country) ?? "Non fourni";
  const localeRaw = displayValue(context.locale ?? context.language ?? row.language ?? customer.language);
  const language = localeRaw ? (() => { try { return new Intl.DisplayNames(["fr"], { type: "language" }).of(localeRaw.replace("_", "-")) ?? localeRaw; } catch { return localeRaw; } })() : "Non fournie";
  const deviceRaw = displayValue(context.device_type ?? context.device ?? row.device);
  const device = deviceRaw ? (({ desktop: "Ordinateur", mobile: "Mobile", tablet: "Tablette" } as Record<string, string>)[deviceRaw.toLowerCase()] ?? deviceRaw) : "Non fourni";
  const failureReason = displayValue(failure.message ?? failure.description ?? failure.code ?? legacyError.message ?? legacyError.description ?? row.failure_reason ?? row.error_message ?? row.status_reason) ?? "Non fournie par Chariow";
  return <><li><i className={`activity-dot activity-${status}`} /><span><b>{label}</b><br />{productName} · {amount ? `${amount.toLocaleString("fr-FR")} ${saleCurrency}` : "Montant indisponible"} · {date ? new Date(String(date)).toLocaleDateString("fr-FR") : "Date indisponible"}</span><button type="button" className="activity-detail" onClick={() => setOpen(true)}>Détail</button></li>{open ? <div className="sale-modal-backdrop" role="presentation" onClick={() => setOpen(false)}><section className="sale-modal sale-modal-wide" role="dialog" aria-modal="true" aria-labelledby="sale-detail-title" onClick={(event) => event.stopPropagation()}><button type="button" className="sale-modal-close" aria-label="Fermer" onClick={() => setOpen(false)}>×</button><span className="eyebrow">Détail Chariow</span><h2 id="sale-detail-title">{label}</h2><h3 className="sale-modal-section-title">Client</h3><div className="sale-detail-grid"><div><small>Nom</small><strong>{customerName}</strong></div><div><small>Email</small><strong>{String(customer.email ?? row.email ?? "Non fourni")}</strong></div><div><small>Téléphone</small><strong>{phone ?? "Non fourni"}</strong></div></div><h3 className="sale-modal-section-title">Informations de paiement</h3><div className="sale-detail-grid"><div><small>Produit</small><strong>{productName}</strong></div><div><small>Prix</small><strong>{price ?? "Non fourni"}</strong></div><div><small>Réduction</small><strong>{discountText}</strong></div><div><small>Montant net</small><strong>{netAmount ?? "Non fourni"}</strong></div>{payoutAmount ? <div><small>Reversé après frais</small><strong>{payoutAmount}</strong></div> : null}{serviceFee ? <div><small>Frais Chariow</small><strong>{serviceFee}</strong></div> : null}{paymentMethod ? <div><small>Moyen de paiement</small><strong>{paymentMethod}</strong></div> : null}<div><small>Source</small><strong>{source}</strong></div><div><small>Boutique</small><strong>{shop}</strong></div></div><h3 className="sale-modal-section-title">Contexte</h3><div className="sale-detail-grid"><div><small>Pays</small><strong>{country}</strong></div><div><small>Langue</small><strong>{language}</strong></div><div><small>Appareil</small><strong>{device}</strong></div><div><small>Date</small><strong>{date ? new Date(String(date)).toLocaleString("fr-FR") : "Non fournie"}</strong></div><div><small>Raison de l’échec</small><strong>{status === "failed" ? failureReason : "Aucune"}</strong></div></div><button type="button" className="btn btn-dark sale-modal-action" onClick={() => setOpen(false)}>Fermer</button></section></div> : null}</>;
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

function Reports({ stores, analytics, selectedStoreId }: { stores: StoreData[]; analytics: AnalyticsData; selectedStoreId: string | null }) {
  // Date par défaut alignée sur celle du backend (lib/chariow/analytics.ts) :
  // du 1er du mois en cours jusqu'à aujourd'hui, tant que l'utilisateur n'a
  // rien choisi lui-même.
  const defaultFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const defaultTo = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(analytics?.kpis.period.from || defaultFrom);
  const [to, setTo] = useState(analytics?.kpis.period.to || defaultTo);

  // Les Rapports ont leur propre jeu de données Chariow, réellement filtré par
  // la période choisie (le bouton "Actualiser" appelait auparavant rien du
  // tout : la période affichée à l'écran ne changeait jamais). On part des
  // données déjà chargées par le tableau de bord, puis on ré-interroge
  // /api/analytics avec from/to dès que l'utilisateur clique sur Actualiser.
  const [reportAnalytics, setReportAnalytics] = useState<AnalyticsData>(analytics);
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const [metaPerformance, setMetaPerformance] = useState<MetaPerformance | null>(null);
  const [loadingAds, setLoadingAds] = useState(true);
  const kpis = reportAnalytics?.kpis;
  const period = from && to ? `${formatReportDate(from)} – ${formatReportDate(to)}` : "Période sélectionnée";
  const currency = reportAnalytics?.products?.[0]?.currency ?? "XOF";

  async function runReport(nextFrom: string, nextTo: string) {
    if (!selectedStoreId) { setReportError("Sélectionne une boutique pour lancer un rapport."); return; }
    setLoadingReport(true);
    setReportError(null);
    try {
      const params = new URLSearchParams({ store_id: selectedStoreId });
      if (nextFrom) params.set("from", nextFrom);
      if (nextTo) params.set("to", nextTo);
      const response = await fetch(`/api/analytics?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setReportError(data.error ?? "Impossible de charger le rapport pour cette période.");
        return;
      }
      setReportAnalytics(data.snapshot ?? null);
    } catch {
      setReportError("Impossible de contacter le serveur. Réessaie dans un instant.");
    } finally {
      setLoadingReport(false);
    }
  }

  // Si la boutique analysée change ailleurs dans l'app, on revient à la
  // période par défaut et on recharge un rapport frais pour cette boutique.
  useEffect(() => {
    if (!selectedStoreId) return;
    setFrom(defaultFrom);
    setTo(defaultTo);
    void runReport(defaultFrom, defaultTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const accountsResponse = await fetch("/api/integrations/meta/accounts");
        const accountsData = accountsResponse.ok ? await accountsResponse.json() : { accounts: [] };
        const accounts = accountsData.accounts ?? [];
        if (!accounts[0]) { if (!cancelled) setMetaPerformance(null); return; }
        const metrics = await fetch(`/api/meta/performance?account_id=${encodeURIComponent(accounts[0].id)}`);
        if (metrics.ok && !cancelled) setMetaPerformance(await metrics.json());
      } finally {
        if (!cancelled) setLoadingAds(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const performances = metaPerformance?.performances ?? [];
  const adsCurrency = metaPerformance?.currency ?? currency;
  const withVerdict = performances.map((campaign) => ({ campaign, verdict: getCampaignVerdict(campaign, adsCurrency) }));
  const topStop = withVerdict.find((item) => item.verdict.tone === "stop");
  const topOptimize = withVerdict.find((item) => item.verdict.tone === "optimize");

  return <>
    <div className="page-top"><div><span className="eyebrow">Pilotage business</span><h1>Rapports</h1><p>Comprends ce qui s’est passé, ce que ça a coûté en pub, et ce que Vendeo recommande de faire.</p></div></div>
    <div className="app-card report-filters" style={{ marginBottom: 18 }}>
      <div className="report-filter-title"><CalendarDays size={17} /><div><strong>Période du rapport</strong><span>Les données Chariow sont analysées au format jour.</span></div></div>
      <div className="report-filter-fields">
        <label>Du<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>Au<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
        <button type="button" className="btn btn-dark" disabled={!stores.length || !selectedStoreId || loadingReport} onClick={() => void runReport(from, to)}>{loadingReport ? "Actualisation…" : "Actualiser"}</button>
      </div>
      {reportError ? <p className="store-error" role="alert" style={{ marginTop: 10 }}>{reportError}</p> : null}
    </div>
    {!reportAnalytics || !kpis ? <div className="empty-state">{loadingReport ? "Chargement du rapport…" : "Aucune donnée pour cette période."}</div> : <>
      <div className="report-period"><span>Rapport analysé</span><strong>{period}</strong></div>
      <div className="report-summary">
        <div className="report-summary-main"><span className="eyebrow">Performance commerciale</span><strong>{kpis.revenue.formatted ?? "0"}</strong><p>{kpis.sales === 0 ? "Aucune vente enregistrée pour cette période." : `${kpis.sales} vente${kpis.sales > 1 ? "s" : ""} enregistrée${kpis.sales > 1 ? "s" : ""}.`}</p></div>
        <div className="report-summary-side"><ReportStat icon={<ShoppingBag size={16} />} label="Ventes" value={kpis.sales} /><ReportStat icon={<Eye size={16} />} label="Visites" value={kpis.visits} /><ReportStat icon={<Users size={16} />} label="Clients" value={kpis.customers} /><ReportStat icon={<BarChart3 size={16} />} label="Conversion" value={kpis.conversionRate} /></div>
      </div>

      <section className="app-card report-section" style={{ marginBottom: 18 }}>
        <div className="card-head"><div><span className="eyebrow">Croisement Chariow × Publicité</span><h2>Dépense pub → trafic → ventes réelles</h2><p>Le calcul central de Vendeo : ce que tu dépenses en pub, comparé à ce que Chariow confirme réellement.</p></div><Activity size={18} color="#103ef8" /></div>
        {loadingAds ? <p className="hint-line">Analyse des campagnes en cours…</p> : !performances.length ? <p className="hint-line">Connecte et synchronise Meta Ads pour voir le croisement avec tes ventes Chariow.</p> : <>
          <div className="vendeo-kpi-grid" style={{ marginBottom: 14 }}>
            <div className="vendeo-kpi"><MetricHelp label="Dépensé (Meta)" description="Somme des dépenses publicitaires synchronisées sur la période." /><strong>{formatMoney(metaPerformance?.overview.spend ?? 0, adsCurrency)}</strong></div>
            <div className="vendeo-kpi"><MetricHelp label="Revenu confirmé (Chariow)" description="Ventes réellement payées, remontées par Chariow — pas les conversions déclarées par Meta." /><strong>{formatMoney(metaPerformance?.overview.chariowRevenue ?? 0, adsCurrency)}</strong></div>
            <div className="vendeo-kpi"><MetricHelp label="Écart Meta / Chariow" description="Revenu déclaré par Meta comparé au revenu réellement confirmé par Chariow. Un grand écart signale une sur-attribution côté Meta." /><strong>{formatMoney((metaPerformance?.overview.metaReportedRevenue ?? 0) - (metaPerformance?.overview.chariowRevenue ?? 0), adsCurrency)}</strong></div>
          </div>
          <p className="hint-line" style={{ marginBottom: 10 }}>Les dépenses ci-dessus viennent de la dernière synchronisation Meta Ads (page Pubs) et ne sont pas encore filtrées par la période du rapport ci-dessus — seules les données Chariow (ventes, visites, clients) le sont.</p>
          <div className="report-table">
            <div className="report-table-head"><span>Campagne</span><span>Dépense</span><span>Conversions liées</span><span>Verdict Vendeo</span></div>
            {withVerdict.map(({ campaign, verdict }) => (
              <div className="report-table-row" key={campaign.id}>
                <strong>{campaign.name}</strong>
                <span>{formatMoney(campaign.spend, adsCurrency)}</span>
                <span>{campaign.conversions}</span>
                <AdVerdictBadge verdict={verdict} />
              </div>
            ))}
          </div>
        </>}
      </section>

      <div className="report-columns">
        <section className="app-card report-section"><div className="card-head"><div><span className="eyebrow">Inventaire et performance</span><h2>Détail des produits</h2></div><strong>{reportAnalytics.products.length} produit{reportAnalytics.products.length > 1 ? "s" : ""}</strong></div>{reportAnalytics.products.length === 0 ? <p className="report-muted">Aucun produit trouvé dans ton catalogue.</p> : <div className="report-table"><div className="report-table-head"><span>Produit</span><span>Statut</span><span>Ventes</span></div>{reportAnalytics.products.map((product) => <div className="report-table-row" key={product.id}><div className="report-product"><span className="report-product-icon">{product.image ? <img src={product.image} alt="" /> : <Package size={16} />}</span><span><strong title={product.name}>{product.name}</strong><small>{formatProductPrice(product)}</small></span></div><span className="report-status">{product.status ?? "Non renseigné"}</span><strong>{product.sales ?? 0}</strong></div>)}</div>}</section>
        <section className="app-card report-section"><div className="card-head"><div><span className="eyebrow">Lecture rapide</span><h2>À retenir</h2></div><Lightbulb size={18} color="#d28b3d" /></div><div className="report-insight"><strong>{kpis.sales === 0 ? "Pas encore de ventes" : "Ton activité commerciale"}</strong><p>{kpis.sales === 0 ? "Teste un partage ciblé de ton produit et observe les visites sur la prochaine période." : "Compare cette période à la précédente pour identifier les produits qui tirent ta croissance."}</p></div><div className="report-insight"><strong>{kpis.visits === 0 ? "Aucune visite enregistrée" : `${kpis.visits} visite${kpis.visits > 1 ? "s" : ""} observée${kpis.visits > 1 ? "s" : ""}`}</strong><p>{kpis.visits === 0 ? "Ta prochaine priorité est d’amener du trafic vers ta boutique." : `Le taux de conversion actuel est de ${kpis.conversionRate}.`}</p></div></section>
      </div>

      <div className="app-card report-conclusion"><div className="card-head"><div><span className="eyebrow">Conclusion Vendeo</span><h2>Ce que tu dois retenir</h2></div><Target size={18} color="#34684d" /></div><div className="conclusion-grid"><div><small>Ce qui s’est passé</small><strong>{kpis.sales === 0 && kpis.visits === 0 ? "La période est encore calme." : `${kpis.sales} vente${kpis.sales > 1 ? "s" : ""} pour ${kpis.visits} visite${kpis.visits > 1 ? "s" : ""}.`}</strong></div><div><small>Pourquoi c’est important</small><strong>{kpis.visits === 0 ? "Sans trafic, aucune conversion n’est possible." : kpis.sales === 0 ? "Le prochain enjeu est de convertir tes visiteurs." : `La conversion actuelle est de ${kpis.conversionRate}.`}</strong></div><div><small>Prochaine action publicitaire</small><strong>{topStop ? topStop.verdict.label : topOptimize ? topOptimize.verdict.label : getRecommendation(reportAnalytics).title}</strong></div></div></div>
    </>}
  </>;
}

const CONNECTED_ACCOUNT_PLATFORMS: Array<{ id: "meta" | "tiktok" | "pinterest"; label: string; description: string; badge: AdPlatform; live: boolean }> = [
  { id: "meta", label: "Meta (Facebook & Instagram)", description: "Diffuse tes campagnes sur Facebook et Instagram.", badge: "facebook", live: true },
  { id: "tiktok", label: "TikTok", description: "Diffuse tes campagnes sur TikTok Ads.", badge: "tiktok", live: true },
  { id: "pinterest", label: "Pinterest", description: "Bientôt disponible.", badge: "pinterest", live: false },
];

function MobileSettingsView({ onNavigate, onSignOut, plan }: { onNavigate: (section: string) => void; onSignOut: () => void; plan: PlanId }) {
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [metaConnected, setMetaConnected] = useState(false);
  const [tiktokConnected, setTiktokConnected] = useState(false);
  const [connectionBusy, setConnectionBusy] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadConnections() {
      try {
        const [metaResponse, tiktokResponse] = await Promise.all([
          fetch("/api/integrations/meta/accounts"),
          fetch("/api/integrations/tiktok/accounts"),
        ]);
        const metaData = metaResponse.ok ? await metaResponse.json().catch(() => ({})) : {};
        const tiktokData = tiktokResponse.ok ? await tiktokResponse.json().catch(() => ({})) : {};
        if (!active) return;
        setMetaConnected((metaData.accounts ?? []).length > 0);
        setTiktokConnected((tiktokData.accounts ?? []).length > 0);
      } finally {
        if (active) setLoadingAccounts(false);
      }
    }
    void loadConnections();
    return () => {
      active = false;
    };
  }, []);

  function connectAccount(platform: "meta" | "tiktok") {
    window.location.href = `/api/integrations/${platform}/connect`;
  }

  async function disconnectAccount(platform: "meta" | "tiktok") {
    setConnectionBusy(platform);
    setConnectionError(null);
    try {
      const response = await fetch(`/api/integrations/${platform}/disconnect`, { method: "POST" });
      if (!response.ok) {
        setConnectionError("Impossible de déconnecter ce compte pour le moment.");
        return;
      }
      if (platform === "meta") setMetaConnected(false);
      else setTiktokConnected(false);
    } catch {
      setConnectionError("Impossible de déconnecter ce compte pour le moment.");
    } finally {
      setConnectionBusy(null);
    }
  }

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

  function applyTheme(next: "light" | "dark") {
    setTheme(next);
    if (next === "dark") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("vendeo-theme", next);
    } catch {
      // Stockage indisponible : le choix s'applique seulement à la session.
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
      <div className="page-top" style={{ marginTop: 28 }}>
        <div>
          <span className="eyebrow">Apparence</span>
          <h2>Thème</h2>
          <p>Choisis l’apparence de ton espace Vendeo.</p>
        </div>
      </div>
      <div className="theme-choice-grid">
        <button type="button" className={`theme-choice ${theme === "light" ? "selected" : ""}`} onClick={() => applyTheme("light")} aria-pressed={theme === "light"}>
          <span className="mobile-settings-icon"><Sun size={20} /></span>
          <span><strong>Clair</strong><small>L’apparence par défaut de Vendeo.</small></span>
          {theme === "light" ? <CheckCircle2 size={16} /> : null}
        </button>
        <button type="button" className={`theme-choice ${theme === "dark" ? "selected" : ""}`} onClick={() => applyTheme("dark")} aria-pressed={theme === "dark"}>
          <span className="mobile-settings-icon"><Moon size={20} /></span>
          <span><strong>Sombre</strong><small>Plus de confort le soir.</small></span>
          {theme === "dark" ? <CheckCircle2 size={16} /> : null}
        </button>
      </div>
      <div className="page-top" style={{ marginTop: 28 }}>
        <div>
          <span className="eyebrow">Canaux publicitaires</span>
          <h2>Comptes connectés</h2>
          <p>Connecte ou déconnecte les comptes publicitaires que Vendeo utilise pour analyser tes performances.</p>
        </div>
      </div>
      {connectionError ? <p className="settings-inline-message settings-account-error" role="alert">{connectionError}</p> : null}
      {CONNECTED_ACCOUNT_PLATFORMS.map((platform) => {
        const allowed = isAdPlatformAllowed(plan, platform.badge);
        const isConnected = platform.id === "meta" ? metaConnected : platform.id === "tiktok" ? tiktokConnected : false;
        const busy = connectionBusy === platform.id;
        return (
          <div className="settings-integration-card" key={platform.id}>
            <div>
              <span className="mobile-settings-icon"><ChannelBadge id={platform.badge} /></span>
              <div>
                <strong>{platform.label}</strong>
                <small>
                  {!platform.live
                    ? "Bientôt disponible"
                    : !allowed
                    ? "Non inclus dans ton plan"
                    : loadingAccounts
                    ? "Vérification…"
                    : isConnected
                    ? "Connecté"
                    : platform.description}
                </small>
              </div>
            </div>
            {!platform.live || !allowed ? (
              <button type="button" className="settings-connect" disabled>
                {!platform.live ? "Bientôt" : "Indisponible"}
              </button>
            ) : isConnected ? (
              <button type="button" className="settings-disconnect" onClick={() => void disconnectAccount(platform.id as "meta" | "tiktok")} disabled={busy}>
                {busy ? "Déconnexion…" : "Déconnecter"}
              </button>
            ) : (
              <button type="button" className="settings-connect" onClick={() => connectAccount(platform.id as "meta" | "tiktok")} disabled={busy}>
                Connecter
              </button>
            )}
          </div>
        );
      })}
      {showDeleteAccountModal ? <div className="account-delete-backdrop" role="presentation" onClick={() => !deletingAccount && setShowDeleteAccountModal(false)}><section className="account-delete-modal" role="dialog" aria-modal="true" aria-labelledby="account-delete-title" onClick={(event) => event.stopPropagation()}><button type="button" className="account-delete-close" aria-label="Fermer" onClick={() => setShowDeleteAccountModal(false)} disabled={deletingAccount}>×</button><div className="account-delete-icon"><Trash2 size={22} /></div><span className="eyebrow">Action irréversible</span><h2 id="account-delete-title">Supprimer ton compte ?</h2><p>Ton profil, tes boutiques, tes conversations et tes connexions publicitaires seront définitivement supprimés.</p><div className="account-delete-warning">Cette action ne peut pas être annulée.</div><div className="account-delete-actions"><button type="button" className="btn btn-ghost" onClick={() => setShowDeleteAccountModal(false)} disabled={deletingAccount}>Annuler</button><button type="button" className="btn account-delete-confirm" onClick={() => void deleteAccount()} disabled={deletingAccount}>{deletingAccount ? "Suppression…" : "Oui, supprimer"}</button></div></section></div> : null}
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
  metaAccounts: Array<{ id: string; name: string | null; currency: string; account_status?: number | null }>;
  selectedMetaAccount: string;
  metaPerformance: MetaPerformance | null;
  metaResources: { pages: Array<{ id: string; name: string }>; pixels: Array<{ id: string; name: string }> } | null;
  metaAccountRestricted: boolean;
  tiktokAccounts: Array<{ id: string; advertiser_id: string; name: string | null; currency: string; status: string | null }>;
};

// --- Moteur de décision Vendeo -------------------------------------------------
// Vendeo n'est plus un outil de lancement de pubs : il lit les campagnes déjà
// diffusées sur Meta/TikTok, les croise avec les ventes réelles Chariow, et dit
// explicitement STOP / OPTIMISER / SURVEILLER — avec un montant chiffré à l'appui.
// Tant que le module d'attribution campagne → produit (cf. lib/attribution) n'est
// pas branché ici, les verdicts s'appuient sur les métriques déjà disponibles
// (dépenses, conversions, CPA, ROAS) ; le niveau de confiance reste donc modéré
// et c'est assumé dans le texte plutôt que présenté comme une certitude.
type AdVerdictTone = "stop" | "optimize" | "watch" | "none";
type AdVerdict = {
  tone: AdVerdictTone;
  emoji: string;
  label: string;       // titre affiché ("Arrête cette pub", "Cette pub fonctionne !")
  diagnosis: string;    // pourquoi ce verdict
  action: string;       // l'action chiffrée à faire
  actionLabel: string;  // texte du bouton ("Arrêter", "Scaler", "Surveiller")
};

function getCampaignVerdict(campaign: MetaPerformance["performances"][number], currency: string): AdVerdict {
  const { spend, conversions, cpa, roas, status } = campaign;

  if (spend <= 0) {
    return {
      tone: "none",
      emoji: "⚪",
      label: "Pas assez de données",
      diagnosis: "Aucune dépense enregistrée sur cette campagne pendant la période.",
      action: "Attends que la campagne dépense avant de juger sa performance.",
      actionLabel: "Suivre",
    };
  }

  if (conversions === 0) {
    return {
      tone: "stop",
      emoji: "🛑",
      label: "Arrête cette pub",
      diagnosis: `${formatMoney(spend, currency)} dépensés sans aucune vente confirmée sur la période. L’audience touchée ne convertit pas, ou le prix ne correspond pas à cette audience.`,
      action: `Coupe cette campagne maintenant — ${formatMoney(spend, currency)} dépensés sans vente.`,
      actionLabel: "Arrêter",
    };
  }

  if (status === "loss") {
    return {
      tone: "stop",
      emoji: "🛑",
      label: "Arrête cette pub",
      diagnosis: cpa !== null ? `Coût par conversion de ${formatMoney(cpa, currency)} : trop élevé pour rester rentable au prix actuel du produit.` : "Le coût par conversion est trop élevé par rapport aux résultats obtenus.",
      action: "Mets cette campagne en pause et vérifie ta marge avant de relancer un budget dessus.",
      actionLabel: "Arrêter",
    };
  }

  if (status === "profitable") {
    // Palier d'augmentation suggéré : 20 % de la dépense actuelle, arrondi au millier, jamais < 2 000.
    const suggestedIncrease = Math.max(2000, Math.round((spend * 0.2) / 1000) * 1000);
    return {
      tone: "optimize",
      emoji: "✅",
      label: "Cette pub fonctionne !",
      diagnosis: roas !== null ? `Retour de ${roas.toFixed(2)}x rapporté par Meta pour ${formatMoney(spend, currency)} dépensés.` : `Cette campagne génère des ventes confirmées pour ${formatMoney(spend, currency)} dépensés.`,
      action: `Augmente le budget de ${formatMoney(suggestedIncrease, currency)}/jour sur cette audience, par paliers, en surveillant le coût par conversion.`,
      actionLabel: "Scaler",
    };
  }

  return {
    tone: "watch",
    emoji: "⚠️",
    label: "Surveille cette pub",
    diagnosis: "Pas encore assez de signal fiable pour recommander d’arrêter ou d’augmenter le budget.",
    action: "Laisse tourner sans y toucher et réanalyse dans quelques jours.",
    actionLabel: "Surveiller",
  };
}

function AdVerdictBadge({ verdict }: { verdict: AdVerdict }) {
  const className = verdict.tone === "stop" ? "meta-status loss" : verdict.tone === "optimize" ? "meta-status profitable" : verdict.tone === "watch" ? "meta-status watch" : "meta-status";
  return <span className={className}>{verdict.emoji} {verdict.label}</span>;
}

// Carte "Recommandations Vendeo" — utilisée en compact sur la Vue d'ensemble
// et en complet sur la page Pubs. compact=true masque le titre (déjà affiché
// par le parent) et limite la liste à 3 recommandations.
function AdsDecisionSummary({
  performances,
  currency,
  onOpenAI,
  compact,
}: {
  performances: MetaPerformance["performances"];
  currency: string;
  onOpenAI: (prompt: string) => void;
  compact?: boolean;
}) {
  const withVerdict = performances.map((campaign) => ({ campaign, verdict: getCampaignVerdict(campaign, currency) }));
  const stop = withVerdict.filter((item) => item.verdict.tone === "stop");
  const optimize = withVerdict.filter((item) => item.verdict.tone === "optimize");
  const watch = withVerdict.filter((item) => item.verdict.tone === "watch");
  const highlighted = [...stop, ...optimize, ...watch].slice(0, compact ? 3 : 8);
  const Wrapper = compact ? "div" : "section";

  return (
    <Wrapper className={compact ? "reco-card-body" : "app-card reco-card"} style={compact ? undefined : { marginBottom: 18 }}>
      {!compact ? (
        <div className="card-head">
          <div><span className="eyebrow">Recommandations Vendeo</span><h2>Que faire maintenant ?</h2><p>Vendeo dit explicitement quoi arrêter, quoi optimiser et quoi surveiller.</p></div>
          <Target size={19} />
        </div>
      ) : null}
      {performances.length === 0 ? (
        <p className="hint-line">Synchronise Meta Ads pour obtenir tes premières recommandations.</p>
      ) : (
        <>
          <div className="vendeo-kpi-grid" style={{ marginTop: compact ? 0 : 12, marginBottom: 12 }}>
            <div className="vendeo-kpi"><span className="metric-label">🛑 À arrêter</span><strong>{stop.length}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">✅ À optimiser</span><strong>{optimize.length}</strong></div>
            <div className="vendeo-kpi"><span className="metric-label">⚠️ À surveiller</span><strong>{watch.length}</strong></div>
          </div>
          <div className="reco-list">
            {highlighted.map(({ campaign, verdict }) => (
              <div className={`reco-item reco-item-${verdict.tone}`} key={campaign.id}>
                <span className="reco-icon">{verdict.emoji}</span>
                <div className="reco-body">
                  <strong>{verdict.label}</strong>
                  <p>{verdict.action}</p>
                  {!compact ? <small>{verdict.diagnosis}</small> : null}
                </div>
                <button
                  type="button"
                  className={`reco-action reco-action-${verdict.tone}`}
                  onClick={() => onOpenAI(`Analyse la campagne "${campaign.name}" (verdict Vendeo : ${verdict.label}) et détaille les prochaines actions à prendre.`)}
                >
                  {verdict.actionLabel}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Wrapper>
  );
}

// Carte "Économies & gains" — budget économisé en arrêtant les pubs qui brûlent
// du cash, et revenu additionnel estimé si les recommandations de scale sont suivies.
function AdsSavingsSummary({ performances, currency }: { performances: MetaPerformance["performances"]; currency: string }) {
  const withVerdict = performances.map((campaign) => ({ campaign, verdict: getCampaignVerdict(campaign, currency) }));
  const stop = withVerdict.filter((item) => item.verdict.tone === "stop");
  const optimize = withVerdict.filter((item) => item.verdict.tone === "optimize");
  const budgetToStop = stop.reduce((sum, item) => sum + item.campaign.spend, 0);
  const revenueFromScale = optimize.reduce((sum, item) => sum + item.campaign.spend * 0.2 * (item.campaign.roas ?? 1), 0);

  return (
    <section className="app-card savings-card">
      <div className="card-head"><div><span className="eyebrow">Économies & gains</span><h2>Impact potentiel</h2></div></div>
      <div className="savings-block">
        <span className="savings-icon savings-icon-stop"><ShieldAlert size={16} /></span>
        <div><small>Budget potentiel économisé</small><strong>{formatMoney(budgetToStop, currency)}</strong><p>sur les pubs sous-performantes</p></div>
      </div>
      <div className="savings-block">
        <span className="savings-icon savings-icon-scale"><TrendingUp size={16} /></span>
        <div><small>Revenu additionnel estimé</small><strong>+ {formatMoney(Math.round(revenueFromScale), currency)}</strong><p>si tu appliques les recommandations</p></div>
      </div>
    </section>
  );
}

// AdsView : uniquement de l'analyse en lecture seule des campagnes déjà diffusées sur Meta/TikTok.
// Le lancement de pub depuis Vendeo (création de campagnes) a été retiré ; il reviendra une fois
// toutes les permissions Meta obtenues. Ce que Vendeo affiche à la place, c'est un verdict explicite
// (STOP / OPTIMISER / SURVEILLER) par campagne, calculé à partir des dépenses, conversions, CPA et
// ROAS déjà synchronisés — voir getCampaignVerdict ci-dessus.
function AdsView({ plan, onGoToAI, onGoToAccounts, onLaunchAd, storeId, campaignsVersion }: { plan: PlanId; onGoToAI: () => void; onGoToAccounts: () => void; onLaunchAd: () => void; storeId: string | null; campaignsVersion: number }) {
  const openAI = (prompt: string) => { sessionStorage.setItem(SESSION_STORAGE_PROMPT_KEY, prompt); onGoToAI(); };
  const [cachedOnce] = useState(() => readCache<AdsCache>(ADS_CACHE_KEY));
  const [channel, setChannel] = useState<"overview" | "meta" | "tiktok">("overview");
  // On ne montre l'écran de chargement que la toute première fois : si on a déjà
  // des données en cache (venant d'un précédent passage sur "Pubs"), on les affiche
  // tout de suite et on rafraîchit silencieusement derrière.
  const [loading, setLoading] = useState(!cachedOnce);
  const [message, setMessage] = useState<string | null>(null);

  const [metaAccounts, setMetaAccounts] = useState<Array<{ id: string; name: string | null; currency: string; account_status?: number | null }>>(cachedOnce?.metaAccounts ?? []);
  const [selectedMetaAccount, setSelectedMetaAccount] = useState(cachedOnce?.selectedMetaAccount ?? "");
  const [metaPerformance, setMetaPerformance] = useState<MetaPerformance | null>(cachedOnce?.metaPerformance ?? null);
  const [metaResources, setMetaResources] = useState<{ pages: Array<{ id: string; name: string }>; pixels: Array<{ id: string; name: string }> } | null>(cachedOnce?.metaResources ?? null);
  const [metaAccountRestricted, setMetaAccountRestricted] = useState(cachedOnce?.metaAccountRestricted ?? false);
  const [metaSyncing, setMetaSyncing] = useState(false);

  const [tiktokAccounts, setTiktokAccounts] = useState<Array<{ id: string; advertiser_id: string; name: string | null; currency: string; status: string | null }>>(cachedOnce?.tiktokAccounts ?? []);

  async function load() {
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
    if (isAdPlatformAllowed(plan, "tiktok")) {
      const tiktokResponse = await fetch("/api/integrations/tiktok/accounts");
      const tiktokData = tiktokResponse.ok ? await tiktokResponse.json() : { accounts: [] };
      nextTiktokAccounts = tiktokData.accounts ?? [];
      setTiktokAccounts(nextTiktokAccounts);
    }
    setLoading(false);
    writeCache(ADS_CACHE_KEY, { metaAccounts: nextMetaAccounts, selectedMetaAccount: nextSelectedMetaAccount, metaPerformance: nextMetaPerformance, metaResources: nextMetaResources, metaAccountRestricted: nextMetaAccountRestricted, tiktokAccounts: nextTiktokAccounts });
  }

  useEffect(() => { void load(); }, []);

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

  const tiktokAllowed = isAdPlatformAllowed(plan, "tiktok");
  const metaConnected = metaAccounts.length > 0;
  const tiktokConnected = tiktokAccounts.length > 0;

  const channels: Array<{ id: "overview" | "meta" | "tiktok"; label: string }> = [{ id: "overview", label: "Vue générale" }, { id: "meta", label: "Meta" }, ...(tiktokAllowed ? [{ id: "tiktok" as const, label: "TikTok" }] : [])];

  return (
    <>
      <div className="page-top"><div><span className="eyebrow">Pilotage publicitaire</span><h1>Pub</h1><p>Lance tes campagnes et retrouve ici leurs statistiques.</p></div></div>

      <div className="app-card" style={{ marginBottom: 18, display: "flex", gap: 8, padding: 8, flexWrap: "wrap" }}><button type="button" className="btn btn-dark" onClick={onLaunchAd}><Plus size={15} /> Lancer une pub</button><span style={{ flex: 1 }} />{channels.map((item) => <button key={item.id} type="button" className={`btn ${channel === item.id ? "btn-dark" : "btn-ghost"}`} onClick={() => setChannel(item.id)}>{item.label}</button>)}</div>

      {message && <p className="store-error" role="status">{message}</p>}

      {channel === "overview" ? <AdCampaignsList storeId={storeId} onNewCampaign={onLaunchAd} key={campaignsVersion} /> : null}

      {channel === "overview" ? <section className="app-card"><div className="card-head"><div><span className="eyebrow">Statistiques</span><h2>Performance publicitaire</h2></div><Activity size={18} /></div><div className="vendeo-kpi-grid"><div className="vendeo-kpi"><span className="metric-label">Dépenses</span><strong>{formatMoney(metaPerformance?.overview.spend ?? 0, metaPerformance?.currency ?? "XOF")}</strong></div><div className="vendeo-kpi"><span className="metric-label">Ventes</span><strong>{metaPerformance?.overview.sales ?? 0}</strong></div><div className="vendeo-kpi"><span className="metric-label">ROAS réel</span><strong>{metaPerformance?.overview.realRoas === null || metaPerformance?.overview.realRoas === undefined ? "Non disponible" : `${metaPerformance.overview.realRoas.toFixed(2)}x`}</strong></div></div></section> : channel === "meta" ? (
        <>
          <div className="app-card" style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>{metaConnected ? <span className="status-positive meta-connected-badge"><CheckCircle2 size={14} /> Meta Ads connectée</span> : <button className="btn btn-dark" onClick={connectMeta}><Plus size={15} /> Connecter Meta Ads</button>}</div>
          {metaPerformance && metaPerformance.overview.conversions === 0 && <div className="meta-conversion-info" role="status">Meta ne rapporte actuellement aucune conversion attribuée. Cela peut être normal si aucune campagne n’a diffusé ou si aucun Pixel/Conversions API n’est configuré sur le parcours de vente Chariow.</div>}
          {metaAccountRestricted ? <div className="meta-account-warning" role="alert"><AlertTriangle size={18} /><div><strong>Ton compte publicitaire Meta est restreint</strong><p>Meta a restreint ce compte ; la synchronisation peut être incomplète tant que la restriction n’est pas levée.</p><a href="https://www.facebook.com/accountquality" target="_blank" rel="noreferrer" className="btn btn-ghost">Vérifier dans Meta</a></div></div> : null}
          {metaConnected && metaResources && !metaResources.pages.length ? <div className="meta-conversion-info">Aucune page Facebook trouvée sur ce Business Manager.</div> : null}
          {!metaConnected ? <div className="empty-state"><BarChart3 size={24} /><strong>Aucun compte Meta Ads connecté</strong><span>Autorise Vendeo à lire tes campagnes, ensembles de publicités et publicités.</span><button className="btn btn-dark" onClick={connectMeta}>Connecter Meta Ads</button></div> : <>
            <div className="app-card meta-toolbar"><label>Compte publicitaire<select value={selectedMetaAccount} onChange={(event) => setSelectedMetaAccount(event.target.value)}>{metaAccounts.map((account) => <option key={account.id} value={account.id}>{account.name ?? account.id}</option>)}</select></label><button className="btn btn-ghost" onClick={syncMeta} disabled={metaSyncing}>{metaSyncing ? "Synchronisation…" : "Synchroniser les insights"}</button></div>
            {metaPerformance ? <><div className="vendeo-kpi-grid meta-kpis"><div className="vendeo-kpi"><MetricHelp label="Dépenses publicitaires" description="Montant dépensé sur Meta Ads pendant la période analysée." /><strong>{formatMoney(metaPerformance.overview.spend, metaPerformance.currency)}</strong></div><div className="vendeo-kpi"><MetricHelp label="Chiffre d’affaires réel Chariow" description="Revenus réellement enregistrés par Chariow." /><strong>{formatMoney(metaPerformance.overview.chariowRevenue, metaPerformance.currency)}</strong></div><div className="vendeo-kpi"><MetricHelp label="Coût moyen par conversion" description="Dépenses divisées par le nombre de conversions déclarées par Meta." /><strong>{metaPerformance.overview.cpa === null ? "Non disponible" : formatMoney(metaPerformance.overview.cpa, metaPerformance.currency)}</strong></div><div className="vendeo-kpi"><MetricHelp label="Coût moyen pour obtenir une vente" description="Dépenses divisées par les ventes réellement enregistrées dans Chariow." /><strong>{metaPerformance.overview.cac === null ? "Non disponible" : formatMoney(metaPerformance.overview.cac, metaPerformance.currency)}</strong></div><div className="vendeo-kpi"><MetricHelp label="Retour publicitaire déclaré par Meta" description="Valeur des achats estimée par Meta divisée par les dépenses." /><strong>{metaPerformance.overview.metaRoas === null ? "Non disponible" : `${metaPerformance.overview.metaRoas.toFixed(2)}x`}</strong></div><div className="vendeo-kpi"><MetricHelp label="Retour publicitaire réel attribué" description="Revenus Chariow reliés à une publicité par attribution, divisés par les dépenses." /><strong>{metaPerformance.overview.realRoas === null ? "Non disponible" : `${metaPerformance.overview.realRoas.toFixed(2)}x`}</strong></div></div><section className="app-card meta-campaigns"><div className="card-head"><div><span className="eyebrow">Analyse média</span><h2>Campagnes qui gagnent ou brûlent du cash</h2></div><Activity size={18} color="#103ef8" /></div><div className="meta-table"><div className="meta-table-head"><span>Campagne</span><span>Dépenses</span><span>Coût par conversion</span><span>Retour publicitaire</span><span>Verdict Vendeo</span></div>{metaPerformance.performances.map((campaign) => { const verdict = getCampaignVerdict(campaign, metaPerformance.currency); return <div className="meta-table-row" key={campaign.id}><strong>{campaign.name}</strong><span>{formatMoney(campaign.spend, metaPerformance.currency)}</span><span>{campaign.cpa === null ? "Non disponible" : formatMoney(campaign.cpa, metaPerformance.currency)}</span><span>{campaign.roas === null ? "Non disponible" : `${campaign.roas.toFixed(2)}x`}</span><AdVerdictBadge verdict={verdict} /></div>; })}</div>{!metaPerformance.performances.length && <p className="hint-line">Aucune campagne synchronisée. Lance une synchronisation Meta Ads.</p>}</section>
            {metaPerformance.performances.length ? <section className="app-card reco-card" style={{ marginTop: 18 }}><div className="card-head"><div><span className="eyebrow">Pourquoi ce verdict</span><h2>Recommandation par campagne</h2></div><Lightbulb size={18} color="#d28b3d" /></div><div className="reco-list">{metaPerformance.performances.map((campaign) => { const verdict = getCampaignVerdict(campaign, metaPerformance.currency); return <div className={`reco-item reco-item-${verdict.tone}`} key={campaign.id}><span className="reco-icon">{verdict.emoji}</span><div className="reco-body"><strong>{campaign.name} — {verdict.label}</strong><p>{verdict.action}</p><small>{verdict.diagnosis}</small></div><button type="button" className={`reco-action reco-action-${verdict.tone}`} onClick={() => openAI(`Analyse la campagne "${campaign.name}" et détaille les prochaines actions.`)}>{verdict.actionLabel}</button></div>; })}</div></section> : null}
            </> : <div className="empty-state">Synchronise ton compte pour afficher les performances.</div>}
          </>}
        </>
      ) : (
        <>
          <div className="app-card" style={{ marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>{tiktokConnected ? <span className="status-positive meta-connected-badge"><CheckCircle2 size={14} /> TikTok Ads connecté</span> : <button className="btn btn-dark" onClick={connectTiktok}><Plus size={15} /> Connecter TikTok Ads</button>}</div>
          {!tiktokConnected ? <div className="empty-state"><BarChart3 size={24} /><strong>Aucun compte TikTok Ads connecté</strong><span>Autorise Vendeo à lire les performances de ton compte publicitaire TikTok.</span><button className="btn btn-dark" onClick={connectTiktok}>Connecter TikTok Ads</button></div> : <div className="meta-conversion-info" role="status">Les statistiques détaillées TikTok Ads (dépenses, ROAS) arrivent bientôt.</div>}
        </>
      )}
    </>
  );
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

function StoresView({ stores, subscription, onStoresChange, onBackToSettings }: { stores: StoreData[]; subscription: SubscriptionData | null; onStoresChange: (stores: StoreData[]) => void; onBackToSettings?: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const currentPlan: PlanId = "starter";
  const maxStores = planMaxStores(currentPlan);

  async function connectChariow(storeId?: string) {
    setError("");
    setSaving(true);
    try {
      if (!storeId) {
        const check = await fetch("/api/integrations/chariow/connect/check");
        const checkData = await check.json().catch(() => ({}));
        if (!check.ok) {
          if (checkData.code === "STORE_LIMIT") setError(checkData.error ?? "Limite de boutiques atteinte.");
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
    </>
  );
}

function SubscriptionView({ subscription, onBackToSettings }: { subscription: SubscriptionData | null; onBackToSettings?: () => void }) {
  const trial = subscription?.trial_active ?? true;
  const isActive = subscription?.status === "active" && !trial;
  const currentPlan: PlanId = "starter";
  const trialEndsAt = subscription?.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt.getTime() - Date.now()) / 86400000)) : null;
  const [changingPlan, setChangingPlan] = useState<PlanId | null>(null);

  async function subscribe(plan: PlanId) {
    setChangingPlan(plan);
    try {
      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();
      if (response.ok && data.payment?.url) {
        window.location.href = data.payment.url;
      } else {
        window.alert(data.error ?? "Impossible de lancer le paiement.");
        setChangingPlan(null);
      }
    } catch {
      window.alert("Impossible de lancer le paiement.");
      setChangingPlan(null);
    }
  }

  if (isActive) {
    const periodStart = subscription?.current_period_start ? new Date(subscription.current_period_start).toLocaleDateString("fr-FR") : "Non disponible";
    const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString("fr-FR") : "Non disponible";
    return (
      <>
        <div className="page-top"><div><span className="eyebrow">Ton abonnement</span><h1>Abonnement Vendeo actif</h1><p>Accès à toute la plateforme et jusqu'à 3 boutiques.</p></div>{onBackToSettings && <button type="button" className="mobile-back-button" onClick={onBackToSettings}><ArrowRight size={15} style={{ transform: "rotate(180deg)" }} /> Paramètres</button>}</div>
        <div className="app-card" style={{ maxWidth: 520 }}>
          <span className="eyebrow">Abonnement en cours</span>
          <h2 style={{ marginTop: 6 }}>Vendeo — 2 000 XOF / mois</h2>
          <div className="sale-detail-grid" style={{ marginTop: 18 }}>
            <div><small>Période en cours depuis</small><strong>{periodStart}</strong></div>
            <div><small>Renouvellement</small><strong>{periodEnd}</strong></div>
            <div><small>Boutiques incluses</small><strong>{planMaxStores(currentPlan)}</strong></div>
            <div><small>Usage IA</small><strong>Illimité</strong></div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-top">
        <div>
          <span className="eyebrow">Ton abonnement</span>
          <h1>Active ton abonnement.</h1>
          <p>{trial && trialDaysLeft !== null ? `Il te reste ${trialDaysLeft} jour${trialDaysLeft > 1 ? "s" : ""} d’essai gratuit.` : "Gère ton usage IA et tes boutiques depuis un seul endroit."}</p>
        </div>
        {onBackToSettings && <button type="button" className="mobile-back-button" onClick={onBackToSettings}><ArrowRight size={15} style={{ transform: "rotate(180deg)" }} /> Paramètres</button>}
      </div>
      <div className="pricing-wrap" style={{ maxWidth: 820 }}>
        <article className="price-card">
          <span className="eyebrow">{trial ? "Essai gratuit — 15 jours" : "Forfait unique"}</span>
          <h3>Vendeo</h3>
          <div className="price">2 000 XOF <small>/ mois</small></div>
          <ul>
            <li>✓ Analyse IA de tes ventes et de tes pubs</li>
            <li>✓ Jusqu'à 3 boutiques Chariow connectées</li>
            <li>✓ Suivi Meta Ads et TikTok Ads</li>
            <li>✓ Rapports détaillés</li>
          </ul>
          <button className="btn btn-ghost" onClick={() => void subscribe("starter")} disabled={changingPlan === "starter"} style={{ width: "100%" }}>
            {changingPlan === "starter" ? "Redirection…" : "S’abonner"}
          </button>
        </article>
      </div>
    </>
  );
}
