"use client";

import Link from "next/link";
import Image from "next/image";
import { BarChart3, Bot, CreditCard, Settings, Store, MessageSquare, LayoutDashboard, Lightbulb, Brain, Sparkles, LogOut, Megaphone, FileText } from "lucide-react";


import { ChatView } from "@/components/ChatView";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useSearchParams } from "next/navigation";

import "@/app/settings-mobile.css";
import { type PlanId } from "@/lib/plans";
import {
  ImpactFinancierCard,
  LaunchAdBar,
  CampaignCrossTable,
  DiagnosticBoutique,
  type CampaignRow,
  type CampaignVerdictBadge,
  type DiagnosticCard,
} from "@/components/vendeo";



import { LaunchAdWizard } from "@/components/vendeo/wizard";


import { useI18n } from "@/lib/i18n/i18n";
import { NotificationCenter } from "@/components/NotificationCenter";
import { AutopilotView } from "@/components/vendeo/AutopilotView";
import { NotificationsView } from "@/components/NotificationsView";
import { readCache, writeCache, DASHBOARD_CACHE_KEY, SESSION_STORAGE_PROMPT_KEY, ADS_CACHE_KEY, MetricHelp, ChannelBadge, type StoreData, type SubscriptionData, type ProductData, type AnalyticsData } from "./dashboard/shared";
import { StoreOnboarding, StudioView, Overview, MarketRadarView, AdsView, MobileSettingsView, StoresView, SubscriptionView, Reports } from "./dashboard/sections";

const ACTIVE_SECTION_STORAGE_KEY = "vendeo_dashboard_active_section";
const DEFAULT_DASHBOARD_SECTION = "Vue d'ensemble";
const PERSISTED_DASHBOARD_SECTIONS = new Set([
  DEFAULT_DASHBOARD_SECTION,
  "Vendeo AI",
  "Studio",
  "Pub",
  "Comptes publicitaires",
  "Radar marché",
  "Mes boutiques",
  "Rapports",
  "Pilotage auto",
  "Abonnement",
  "Paramètres",
  "Notifications",
]);

function getInitialDashboardSection() {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_SECTION;
  try {
    const savedSection = window.sessionStorage.getItem(ACTIVE_SECTION_STORAGE_KEY);
    return savedSection && PERSISTED_DASHBOARD_SECTIONS.has(savedSection) ? savedSection : DEFAULT_DASHBOARD_SECTION;
  } catch {
    return DEFAULT_DASHBOARD_SECTION;
  }
}

export function Dashboard() {
  const { t } = useI18n();
  const [active, setActive] = useState(getInitialDashboardSection);
  const [moreOpen, setMoreOpen] = useState(false);
  // Se souvient de la section affichée juste avant d'ouvrir "Vendeo AI", pour que
  // le bouton retour de la section IA ramène exactement là d'où l'utilisateur vient
  // (au lieu de toujours revenir à la Vue d'ensemble).
  const [previousSection, setPreviousSection] = useState("Vue d'ensemble");
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
      setActive((event.state && event.state.vendeoView) || "Vue d'ensemble");
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
  useEffect(() => {
    try {
      window.sessionStorage.setItem(ACTIVE_SECTION_STORAGE_KEY, active);
    } catch {
      // Le stockage peut être indisponible en navigation privée ou si le quota est plein.
    }
  }, [active]);

  const searchParams = useSearchParams();
  useEffect(() => {
    const updateNetworkStatus = () => setIsOffline(!navigator.onLine);
    updateNetworkStatus();
    window.addEventListener("online", updateNetworkStatus);
    window.addEventListener("offline", updateNetworkStatus);
    return () => {
      window.removeEventListener("online", updateNetworkStatus);
      window.removeEventListener("offline", updateNetworkStatus);
    };
  }, []);
  const [stores, setStores] = useState<StoreData[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
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
    ["Vue d'ensemble", LayoutDashboard],
    ["Vendeo AI", MessageSquare],
    ["Studio", Sparkles],
    ["Pub", Megaphone],
    ["Comptes publicitaires", BarChart3],
    ["Radar marché", Lightbulb],
    ["Mes boutiques", Store],
    ["Rapports", FileText],
    ["Pilotage auto", Bot],
    ["Abonnement", CreditCard],
  ] as const;

  // Clé d'internationalisation par section : l'état interne reste en français,
  // seul le libellé affiché change selon la langue.
  const navKey: Record<string, string> = {
    "Vue d'ensemble": "nav.overview",
    "Vendeo AI": "nav.assistant",
    "Studio": "nav.studio",
    "Pub": "nav.pubs",
    "Comptes publicitaires": "nav.adAccounts",
    "Radar marché": "nav.radar",
    "Mes boutiques": "nav.stores",
    "Rapports": "nav.reports",
    "Pilotage auto": "nav.autopilot",
    "Abonnement": "nav.subscription",
    "Paramètres": "nav.settings",
  };

  async function signOut() {
    try {
      const cache = await caches.open("vendeo-shell-v3");
      await cache.delete("/dashboard");
    } catch {
      // Le cache hors ligne peut être indisponible dans certains navigateurs.
    }
    await createClient().auth.signOut();
    window.location.href = "/";
  }

  useEffect(() => {
    const s = searchParams.get("chariow");
    const x = searchParams.get("x");
    if (s && ["connected", "failed", "expired", "revoked", "pending"].includes(s)) {
      setActive("Mes boutiques");
    }
    if (x && ["connected", "no_ad_account", "account_access_denied", "failed"].includes(x)) {
      setActive("Paramètres");
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
      {isOffline ? <div role="status" aria-live="polite" className="offline-notice">Connexion internet perdue. Certaines données peuvent être obsolètes.</div> : null}
      {active !== "Vendeo AI" ? (
        <header className="app-header">
          <Link href="/" className="brand">
            <Image className="brand-logo" src="/vendeo-logo-light.webp" alt="Vendeo" width={150} height={40} unoptimized />
          </Link>
          <div className="app-user">
            <NotificationCenter onOpen={() => setActive("Notifications")} />
             <button type="button" className={`mobile-more-trigger ${moreOpen || ["Rapports", "Mes boutiques", "Abonnement", "Paramètres", "Comptes publicitaires"].includes(active) ? "active" : ""}`} aria-label="Plus d'options" aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
            </button>
            <button className="desktop-signout" onClick={signOut} style={{ background: "transparent", border: 0, color: "#c7d2fe", fontSize: 11 }}>
              Déconnexion
            </button>
          </div>
        </header>
      ) : null}
      <div className={`app-layout${active === "Vendeo AI" ? " app-layout-flush" : ""}${isOffline ? " app-layout-offline" : ""}`}>
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
              {t(navKey[name] ?? name)}
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
            {isActivePlan ? <p style={{ fontSize: 11, lineHeight: 1.5, margin: "9px 0", color: "#334155" }}>Ton abonnement Vendeo est actif.</p> : <><p style={{ fontSize: 11, lineHeight: 1.5, margin: "9px 0", color: "#334155" }}>{subscription?.status === "past_due" ? "Ton abonnement a expiré. Réactive-le pour continuer." : "Choisis l'abonnement pour continuer après ton essai."}</p><button className="btn btn-dark" style={{ fontSize: 10, padding: "8px 10px", width: "100%" }} onClick={() => setActive("Abonnement")}>Voir l'abonnement</button></>}
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
            <MobileSettingsView onNavigate={setActive} onSignOut={signOut} plan={(subscription?.plan ?? "starter") as PlanId} onBack={() => setActive(previousSection)} />
          ) : active === "Vendeo AI" ? (
            <ChatView
              onGoToSubscription={() => setActive("Abonnement")}
              onUsageChange={(patch) =>
                setSubscription((prev) => (prev ? { ...prev, ...patch } : prev))
              }
              onBack={() => setActive(previousSection)}
            />
          ) : active === "Studio" ? (
            <StudioView products={analytics?.products ?? []} />
          ) : active === "Pub" ? (
             <AdsView plan={(subscription?.plan ?? "starter") as PlanId} onGoToAI={() => setActive("Vendeo AI")} onGoToAccounts={() => setActive("Paramètres")} onLaunchAd={launchAd} storeId={stores[0]?.id ?? null} campaignsVersion={campaignsVersion} />
           ) : active === "Comptes publicitaires" ? (
            <MobileSettingsView onNavigate={setActive} onSignOut={signOut} plan={(subscription?.plan ?? "starter") as PlanId} focus="channels" onBack={() => setActive(previousSection)} />
          ) : active === "Radar marché" ? (
             <MarketRadarView onGoToAI={(prompt) => { sessionStorage.setItem(SESSION_STORAGE_PROMPT_KEY, prompt); setActive("Vendeo AI"); }} />
           ) : active === "Mes boutiques" ? (
            <StoresView stores={stores} subscription={subscription} onStoresChange={setStores} onBackToSettings={() => setActive("Paramètres")} />
          ) : active === "Abonnement" ? (
            <SubscriptionView subscription={subscription} onBackToSettings={() => setActive("Paramètres")} />
          ) : active === "Rapports" ? (
            <Reports stores={stores} analytics={analytics} selectedStoreId={selectedStoreId} />
          ) : active === "Notifications" ? (
            <NotificationsView onBack={() => setActive(previousSection)} />
          ) : active === "Pilotage auto" ? (
            <AutopilotView />
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


        {active !== "Paramètres" ? (
         <nav className="mobile-nav" aria-label="Navigation mobile">
         <button type="button" className={`nav-btn ${active === "Vue d'ensemble" ? "active" : ""}`} onClick={() => setActive("Vue d'ensemble")}>
           <LayoutDashboard size={18} />
            <span>{t("nav.overview")}</span>
         </button>
           <button type="button" className={`nav-btn ${active === "Pub" ? "active" : ""}`} onClick={() => setActive("Pub")}>
             <Megaphone size={18} />
              <span>{t("nav.pubs")}</span>
          </button>
             <button type="button" className={`nav-btn nav-btn-assistant ${active === "Vendeo AI" ? "active" : ""}`} onClick={() => setActive("Vendeo AI")}>
               <Brain size={23} strokeWidth={2.2} />
               <span>{t("nav.assistant")}</span>
             </button>
            <button type="button" className={`nav-btn ${active === "Studio" ? "active" : ""}`} onClick={() => setActive("Studio")}>
              <Sparkles size={21} strokeWidth={2.5} />
              <span>{t("nav.studio")}</span>
            </button>
             <button type="button" className={`nav-btn ${active === "Radar marché" ? "active" : ""}`} onClick={() => setActive("Radar marché")}>
               <Lightbulb size={18} />
                <span>{t("nav.radar")}</span>
             </button>
        </nav>
        ) : null}
         {moreOpen ? (
          <>
            <button type="button" className="mobile-more-backdrop" aria-label="Fermer le menu" onClick={() => setMoreOpen(false)} />
            <div className="mobile-more-menu" role="menu" aria-label="Plus d'options">
              <span className="mobile-more-label">Analyse</span>
              <button type="button" role="menuitem" className={active === "Rapports" ? "active" : ""} onClick={() => { setActive("Rapports"); setMoreOpen(false); }}><FileText size={16} /> Rapports</button>
              <button type="button" role="menuitem" className={active === "Pilotage auto" ? "active" : ""} onClick={() => { setActive("Pilotage auto"); setMoreOpen(false); }}><Bot size={16} /> Pilotage auto</button>
              <span className="mobile-more-label">Mon compte</span>
              <button type="button" role="menuitem" className={active === "Abonnement" ? "active" : ""} onClick={() => { setActive("Abonnement"); setMoreOpen(false); }}><CreditCard size={16} /> Abonnement</button>
              <span className="mobile-more-label">Application</span>
              <button type="button" role="menuitem" className={active === "Paramètres" ? "active" : ""} onClick={() => { setActive("Paramètres"); setMoreOpen(false); }}><Settings size={16} /> Paramètres</button>
              <button type="button" role="menuitem" className="danger" onClick={() => { setMoreOpen(false); signOut(); }}><LogOut size={16} /> Déconnexion</button>
            </div>
          </>
        ) : null}
    </main>
  );
}
