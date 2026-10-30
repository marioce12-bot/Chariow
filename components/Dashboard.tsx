"use client";

import Link from "next/link";
import Image from "next/image";
import { BarChart3, CreditCard, Settings, Store, MessageSquare, Grid2X2, Lightbulb, Brain, Palette, LogOut, Megaphone, FileText } from "lucide-react";


import { ChatView } from "@/components/ChatView";
import type { ChatNavigationSection } from "@/components/chat/navigation-intent";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useSearchParams } from "next/navigation";
import { disablePushSubscription } from "@/lib/push/browser";

import "@/app/settings-mobile.css";
import "@/app/dashboard-navigation.css";
import { DashboardHeaderNavigation, DashboardPrimaryNavigation } from "./dashboard/DesktopNavigation";
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


import type { EditableCampaign } from "@/components/vendeo/wizard/types";
import { useI18n } from "@/lib/i18n/i18n";
import { NotificationCenter } from "@/components/NotificationCenter";
import { NotificationsView } from "@/components/NotificationsView";
import { clearUsageSessionStorage, useUsageTracking } from "@/components/useUsageTracking";
import { SESSION_STORAGE_PROMPT_KEY, MetricHelp, ChannelBadge, type StoreData, type SubscriptionData, type ProductData, type AnalyticsData } from "./dashboard/shared";
import { StudioView, MarketRadarView, AdsView, MobileSettingsView, StoresView, SubscriptionView, Reports } from "./dashboard/sections";
import { AdPerformanceView } from "./dashboard/AdPerformanceView";
import { usePerformanceRecommendationBadges } from "./dashboard/usePerformanceRecommendationBadges";
import { OverviewHome } from "./dashboard/OverviewHome";
import { DashboardSkeleton } from "./dashboard/Skeleton";
import ProductProfitPanel from "./dashboard/ProductProfitPanel";
import RecoveryPanel from "./dashboard/RecoveryPanel";
import { NotificationPermissionPrompt } from "./NotificationPermissionPrompt";
import { DashboardStoreSelector } from "./dashboard/StoreSelector";
import "@/app/dashboard-refinement.css";
import { useMobileNavVisibility } from "./dashboard/useMobileNavVisibility";
import { StoreConnectionGate, hasConnectedCommerceStore } from "./dashboard/StoreConnectionGate";
import { SaleCelebration } from "./dashboard/SaleCelebration";
import { FirstStoreWelcome } from "./dashboard/FirstStoreWelcome";
import { useFirstStoreOnboarding } from "./dashboard/useFirstStoreOnboarding";

import { NavigationDataProvider, useNavigationData, useNavigationCache } from "./dashboard/NavigationDataCache";
import { DASHBOARD_ANALYTICS_REFRESH_MS, getDashboardAnalyticsUrl } from "@/lib/dashboard-analytics-periods";
import type { DashboardTourStep } from "./dashboard/tour-steps";
type DashboardAnalyticsResponse = { snapshot: AnalyticsData; rolling30Snapshot: AnalyticsData; periodSnapshot: AnalyticsData };
type StoredDashboardAnalyticsResponse = { storeId: string; data: DashboardAnalyticsResponse };
const ACTIVE_SECTION_STORAGE_KEY = "vendeo_dashboard_active_section";
// Dernière boutique choisie dans le sélecteur : conservée dans localStorage (et non
// sessionStorage) pour survivre à la fermeture de l'appli, quel que soit l'ordre
// dans lequel les boutiques ont été connectées.
const SELECTED_STORE_STORAGE_KEY = "vendeo_selected_store_id";
const DEFAULT_DASHBOARD_SECTION = "Vue d'ensemble";
const PERSISTED_DASHBOARD_SECTIONS = new Set([
  DEFAULT_DASHBOARD_SECTION,
  "Vendeo AI",
  "Studio",
  "Pub",
  "Performance publicitaire",
  "Comptes publicitaires",
  "Radar marché",
  "Mes boutiques",
  "Rapports",
  "Bénéfices nets",
  "Relances WhatsApp",
  "Abonnement",
  "Paramètres",
  "Notifications",
  "Suggestions et notes",
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

function readSavedStoreId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SELECTED_STORE_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function Dashboard() {
  const [identity, setIdentity] = useState("current-session");
  useEffect(() => {
    const auth = createClient().auth;
    let knownUser: string | null | undefined;
    const result = auth.onAuthStateChange?.((_event, session) => {
      const nextUser = session?.user?.id ?? null;
      if (knownUser !== undefined && knownUser !== nextUser) {
        clearUsageSessionStorage();
        setIdentity(nextUser ?? "signed-out");
      }
      knownUser = nextUser;
    });
    return () => result?.data.subscription.unsubscribe();
  }, []);
  return <NavigationDataProvider key={identity}><DashboardWorkspace /></NavigationDataProvider>;
}

function DashboardWorkspace() {
  const navigationCache = useNavigationCache();
  const { t, locale } = useI18n();
  const w = (key: string) => t(`workspaceExtra.${key}`);
  const [active, setActive] = useState(getInitialDashboardSection);
  const mobileNavVisible = useMobileNavVisibility(active);
  // Suivi anonyme du temps passé par section (alimente l'onglet « Usage de l'app » de la console admin).
  useUsageTracking(active);
  const [moreOpen, setMoreOpen] = useState(false);
  const [guideMenuTarget, setGuideMenuTarget] = useState<string | null>(null);
  const [guideAssistantHighlight, setGuideAssistantHighlight] = useState(false);
  useEffect(() => {
    if (!moreOpen) return;
    if (document.querySelector(".vendeo-tour-layer")) return;
    const menu = document.querySelector<HTMLElement>(".mobile-more-menu");
    const items = Array.from(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    items[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMoreOpen(false);
        document.querySelector<HTMLButtonElement>(".mobile-more-trigger")?.focus();
        return;
      }
      if (!menu?.contains(document.activeElement) || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [moreOpen]);
  const [settingsFocus, setSettingsFocus] = useState<"index" | "appearance" | "accounts">("index");
  const [settingsNavigationVersion, setSettingsNavigationVersion] = useState(0);
  function openSettingsIndex() {
    setSettingsFocus("index");
    setSettingsNavigationVersion((version) => version + 1);
    setMoreOpen(false);
    setGuideMenuTarget(null);
    setActive("Paramètres");
  }
  function backToAccountSettings() {
    setSettingsFocus("accounts");
    setActive("Paramètres");
  }
  function mobileMoreItemClass(section: string) {
    return [active === section ? "active" : "", guideMenuTarget === section ? "guide-highlight" : ""].filter(Boolean).join(" ");
  }
  function navigateFromAssistant(section: ChatNavigationSection) {
    if (section === "Paramètres") { openSettingsIndex(); return; }
    if (section === "Comptes publicitaires") setSettingsFocus("accounts");
    setMoreOpen(false);
    setGuideMenuTarget(null);
    setActive(section);
  }
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
      const requestedSection = event.state?.vendeoView;
      setActive(typeof requestedSection === "string" && PERSISTED_DASHBOARD_SECTIONS.has(requestedSection) ? requestedSection : DEFAULT_DASHBOARD_SECTION);
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

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
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
  // Boutique réellement utilisée pour l'onglet "Pub" et le lancement d'une campagne : celle choisie
  // dans le sélecteur (si elle existe encore), sinon la première. Avant, on prenait toujours stores[0].
  const activeStoreId = (selectedStoreId && stores.some((store) => store.id === selectedStoreId) ? selectedStoreId : stores[0]?.id) ?? null;
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  // Vrai tant que l'abonnement et les données de la boutique (analytics) n'ont pas fini de charger :
  // la Vue d'ensemble affiche alors des skeletons au lieu de zéros / textes provisoires.
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [analyticsStoreId, setAnalyticsStoreId] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsData>(null);
  const [lastAnalyticsResponse, setLastAnalyticsResponse] = useState<StoredDashboardAnalyticsResponse | null>(null);
  // null tant que le nom n'est pas connu : la salutation reste en skeleton (pas de « Bonjour créateur » provisoire).
  const [userName, setUserName] = useState<string | null>(null);
  const [notificationUserId, setNotificationUserId] = useState<string | null>(null);

  const userFirstName = userName ? (userName.trim().split(/\s+/)[0] || "créateur") : null;
  const {
    hasNewRecommendation,
    reportRecommendation,
  } = usePerformanceRecommendationBadges({ userId: notificationUserId, storeId: activeStoreId, activeSection: active });
  const reportCampaignRecommendation = useCallback((storeId: string, signature: string | null) => {
    reportRecommendation("campaign", storeId, signature);
  }, [reportRecommendation]);
  // Plus de quota de messages IA : l'accès est illimité tant que l'essai de
  // 5 jours ou l'abonnement Vendeo est actif.
  const isActivePlan = subscription?.status === "active" && subscription?.trial_active === false;
  const [wizardOpen, setWizardOpen] = useState(false);
  // Produit choisi via le bouton « Promouvoir » du catalogue : le formulaire de pub saute alors l'étape « Produit ».
  const [wizardProduct, setWizardProduct] = useState<ProductData | null>(null);
  const [wizardDuplicateCampaign, setWizardDuplicateCampaign] = useState<EditableCampaign | null>(null);
  const [campaignsVersion, setCampaignsVersion] = useState(0);
  const [overviewPeriodDays, setOverviewPeriodDays] = useState(30);
  // Le formulaire de création de pub (LaunchAdWizard) vit ici, au niveau de l'appli,
  // pour que le bouton "Lancer une pub" de l'accueil ET celui de l'onglet "Pub"
  // ouvrent directement le même formulaire, au lieu que celui de "Pub" se contente
  // de changer d'onglet en laissant l'utilisateur cliquer une seconde fois.
  function changeStore(id: string | null) {
    setWizardOpen(false);
    setWizardProduct(null);
    setWizardDuplicateCampaign(null);
    setSelectedStoreId(id);
  }
  function launchAd() {
    if (!activeStoreId) {
      setActive("Mes boutiques");
      return;
    }
    // Lancement classique (sans produit précis) : l'utilisateur choisit le produit à l'étape 1.
    setWizardProduct(null);
    setWizardDuplicateCampaign(null);
    setWizardOpen(true);
  }

  // Bouton « Promouvoir » d'un produit du catalogue : on ouvre le même formulaire, produit déjà choisi.
  function promoteProduct(product: ProductData) {
    if (!activeStoreId) {
      setActive("Mes boutiques");
      return;
    }
    setWizardDuplicateCampaign(null);
    setWizardProduct(product);
    setWizardOpen(true);
  }

  function applyRecommendedCampaign(campaign: EditableCampaign) {
    if (!activeStoreId) {
      setActive("Mes boutiques");
      return;
    }
    setWizardProduct(null);
    setWizardDuplicateCampaign(campaign);
    setWizardOpen(true);
  }


  async function signOut() {
    try {
      const cache = await caches.open("vendeo-shell-v3");
      await cache.delete("/dashboard");
    } catch {
      // Le cache hors ligne peut être indisponible dans certains navigateurs.
    }
    try {
      await disablePushSubscription();
    } catch {
      console.warn("Push subscription cleanup failed during sign out.");
    }
    // Supabase defaults to global logout, which also revokes other devices.
    await createClient().auth.signOut({ scope: "local" });
    window.location.href = "/";
  }

  useEffect(() => {
    const s = searchParams.get("chariow");
    if (s === "connected") {
      setActive(DEFAULT_DASHBOARD_SECTION);
    } else if (s && ["failed", "expired", "revoked", "pending"].includes(s)) {
      setActive("Mes boutiques");
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const client = createClient();
    client.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setNotificationUserId(data.user?.id ?? null);
      const metadata = data.user?.user_metadata as { full_name?: string; name?: string; first_name?: string } | undefined;
      const name = metadata?.full_name ?? metadata?.name ?? metadata?.first_name ?? data.user?.email?.split("@")[0];
      setUserName(name || "créateur");
    }).catch(() => {
      if (!cancelled) setUserName(t("sweep3.text116"));
    });

    async function loadDashboard() {
      const preferredStoreId = readSavedStoreId();
      const storeResponse = await fetch("/api/stores");
      const storeResult = storeResponse.ok ? await storeResponse.json() : { stores: [] };
      if (cancelled) return;
      const nextStores = storeResult.stores ?? [];
      setStores(nextStores);

      // Si la boutique mémorisée n'existe plus (supprimée, déconnectée), on se rabat sur la première.
      const nextSelected = preferredStoreId && nextStores.some((store: StoreData) => store.id === preferredStoreId && store.connection_status === "connected")
        ? preferredStoreId
        : nextStores.find((store: StoreData) => store.platform === "chariow" && store.connection_status === "connected")?.id ?? nextStores[0]?.id ?? null;
      setSelectedStoreId(nextSelected);

      setLoadingData(false);

      const subscriptionResponse = await fetch("/api/subscription");
      const subscriptionResult = subscriptionResponse.ok ? await subscriptionResponse.json() : { subscription: null };
      if (cancelled) return;
      const nextSubscription = subscriptionResult.subscription ?? null;
      setSubscription(nextSubscription);

    }

    loadDashboard().catch(() => {
      if (!cancelled) {
        setLoadingData(false);
        setOverviewLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Mémorise le choix de boutique à chaque changement, pour le retrouver à la réouverture de l'appli.
  useEffect(() => {
    if (!selectedStoreId) return;
    try {
      window.localStorage.setItem(SELECTED_STORE_STORAGE_KEY, selectedStoreId);
    } catch {
      // Le stockage peut être indisponible en navigation privée ou si le quota est plein.
    }
  }, [selectedStoreId]);

  const analyticsUrl = activeStoreId ? getDashboardAnalyticsUrl(activeStoreId, overviewPeriodDays) : null;
  const analyticsReading = useNavigationData<DashboardAnalyticsResponse>(analyticsUrl, {
    freshMs: DASHBOARD_ANALYTICS_REFRESH_MS,
    refreshIntervalMs: DASHBOARD_ANALYTICS_REFRESH_MS,
    visibleOnly: true,
    refreshOnVisibilityReturn: true,
    completionAnchoredRefresh: true,
  });
  const dashboardAnalyticsData = analyticsReading.data
    ?? (lastAnalyticsResponse?.storeId === activeStoreId ? lastAnalyticsResponse.data : undefined);
  useEffect(() => {
    if (!activeStoreId || !analyticsReading.data) return;
    setLastAnalyticsResponse((previous) => previous?.storeId === activeStoreId && previous.data === analyticsReading.data
      ? previous
      : { storeId: activeStoreId, data: analyticsReading.data! });
  }, [activeStoreId, analyticsReading.data]);
  useEffect(() => {
    if (!activeStoreId) {
      setAnalytics(null);
      setAnalyticsStoreId(null);
      setOverviewLoading(false);
      return;
    }
    if (analyticsReading.loading) {
      setOverviewLoading(lastAnalyticsResponse?.storeId !== activeStoreId && analyticsStoreId !== activeStoreId);
      return;
    }
    const nextAnalytics = dashboardAnalyticsData?.snapshot ?? null;
    setAnalytics(nextAnalytics);
    setAnalyticsStoreId(activeStoreId);
    setOverviewLoading(false);
  }, [activeStoreId, analyticsReading.loading, analyticsStoreId, dashboardAnalyticsData, lastAnalyticsResponse?.storeId]);

  // The identity check hides previous-store figures in the very first render,
  // before the effect has had a chance to set its loading flag.
  const storeDataLoading = overviewLoading || analyticsStoreId !== activeStoreId;
  const snapshotView = ["Vue d'ensemble", "Rapports", "Studio"].includes(active);
  const needsStoreConnection = !loadingData && !hasConnectedCommerceStore(stores);

  const onboarding = useFirstStoreOnboarding({ userId: notificationUserId, stores, loading: loadingData, connected: !needsStoreConnection && !loadingData });
  const onboardingOpen = onboarding.stage !== "closed" && !needsStoreConnection && !loadingData;
  const handleTourStepChange = useCallback((step: DashboardTourStep | null) => {
    if (!step) {
      setMoreOpen(false);
      setGuideMenuTarget(null);
      setGuideAssistantHighlight(false);
      return;
    }
    setGuideAssistantHighlight(step.id === "assistant");
    if (step.activeSection) setActive(step.activeSection);
    if (step.settingsFocus) {
      setSettingsFocus(step.settingsFocus);
      setSettingsNavigationVersion((version) => version + 1);
    }
    setMoreOpen(Boolean(step.openMobileMenu));
    setGuideMenuTarget(step.openMobileMenu ? step.menuTarget ?? null : null);
  }, []);
  function replayGuide() { setActive(DEFAULT_DASHBOARD_SECTION); setMoreOpen(false); setGuideMenuTarget(null); onboarding.replay(); }
  return (
    <>
    {notificationUserId && !needsStoreConnection && !loadingData && !onboardingOpen && <SaleCelebration key={notificationUserId} userId={notificationUserId} />}
    <main className={`app-shell dashboard-platform${active === "Vendeo AI" ? " dashboard-assistant-active" : ""}${isOffline ? " dashboard-is-offline" : ""}`}>
      <div className="dashboard-workspace" inert={needsStoreConnection || onboardingOpen ? true : undefined} aria-hidden={needsStoreConnection || onboardingOpen ? true : undefined}>
      {notificationUserId && !needsStoreConnection && !loadingData && !onboardingOpen && <NotificationPermissionPrompt key={notificationUserId} userId={notificationUserId} />}
      {isOffline ? <div role="status" aria-live="polite" className="offline-notice">{w("offline")}</div> : null}
        <header className="app-header">
          <Link href="/" className="brand">
            <Image className="brand-logo" src="/vendeo-logo.webp" alt="Vendeo" width={150} height={40} unoptimized />
          </Link>
          <div className="dashboard-header-context"><span>{w("workspace")}</span><span aria-hidden="true">/</span><strong>{active === "Vue d'ensemble" ? w("preview") : locale === "en" ? ({"Radar marché":"Market radar","Performance publicitaire":"Recommendations","Bénéfices nets":"Net profit","Relances WhatsApp":"WhatsApp follow-ups","Mes boutiques":"My stores","Paramètres":"Settings","Comptes publicitaires":"Ad accounts","Rapports":"Reports","Abonnement":"Subscription","Suggestions et notes":"Suggestions and feedback"}[active] ?? active) : active === "Performance publicitaire" ? "Recommandation" : active}</strong></div>
          <DashboardHeaderNavigation active={active} onChange={(section) => section === "Paramètres" ? openSettingsIndex() : setActive(section)} />
          <div className="app-user">
            <NotificationCenter onOpen={() => setActive("Notifications")} />
             <button type="button" data-onboarding="mobile-more-trigger" className={`mobile-more-trigger ${moreOpen || ["Radar marché", "Rapports", "Bénéfices nets", "Relances WhatsApp", "Performance publicitaire", "Paramètres"].includes(active) ? "active" : ""}`} aria-label={w("moreOptions")} aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen((open) => !open)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
            </button>
            <button type="button" className="vendeo-guide-replay" onClick={replayGuide} aria-label={locale === "en" ? "Replay the workspace guide" : "Revoir le guide de mon espace"}>{locale === "en" ? "Guide" : "Guide"}</button>
            <button type="button" className="dashboard-profile" onClick={() => setActive("Paramètres")} aria-label={w("profile")} title={w("profile")}><span className="dashboard-avatar">{userFirstName?.slice(0, 2).toUpperCase() || "V"}</span></button>
            <button type="button" className="desktop-signout" onClick={signOut} aria-label={w("signOut")} title={w("signOut")}><LogOut size={15} /></button>
          </div>
        </header>
      <div className={`app-layout${active === "Vendeo AI" ? " app-layout-flush" : ""}${isOffline ? " app-layout-offline" : ""}`}>
        <aside className="sidebar">
          <div className="dashboard-sidebar-store" data-onboarding="store">
            <DashboardStoreSelector stores={stores} selectedStoreId={activeStoreId} onChange={changeStore} loading={loadingData} />
          </div>
          <DashboardPrimaryNavigation active={active} onChange={setActive} />
          <button type="button" className="dashboard-plan-status" onClick={() => setActive("Abonnement")}>
            <span className="dashboard-plan-dot" aria-hidden="true" />
            <span><strong>{isActivePlan ? w("planActive") : subscription?.status === "past_due" ? w("planExpired") : w("freeTrial")}</strong><small>{isActivePlan ? w("managePlan") : w("viewPlan")}</small></span>
            <CreditCard size={16} aria-hidden="true" />
          </button>
        </aside>
        <section className={`app-main${active === "Vendeo AI" ? " chat-page" : ""}${active === "Performance publicitaire" ? " app-performance-main" : ""}`}>
          {loadingData || (snapshotView && storeDataLoading) ? (
            <DashboardSkeleton />
          ) : active === "Paramètres" ? (
            <MobileSettingsView key={`${settingsFocus}-${settingsNavigationVersion}`} onNavigate={setActive} onSignOut={signOut} plan={(subscription?.plan ?? "starter") as PlanId} focus={settingsFocus === "index" ? undefined : settingsFocus} />
          ) : active === "Vendeo AI" ? (
            <ChatView
              onGoToSubscription={() => setActive("Abonnement")}
              onNavigateSection={navigateFromAssistant}
              onUsageChange={(patch) =>
                setSubscription((prev) => (prev ? { ...prev, ...patch } : prev))
              }
              onBack={() => setActive(previousSection)}
            />
          ) : active === "Studio" ? (
            <StudioView products={analytics?.products ?? []} />
          ) : active === "Performance publicitaire" ? (
            <AdPerformanceView key={activeStoreId ?? "no-store"} storeId={activeStoreId} onApplyCampaign={applyRecommendedCampaign} onRecommendationChange={reportCampaignRecommendation} products={analytics?.products ?? []} locale={locale} />
          ) : active === "Pub" ? (
             <AdsView key={activeStoreId} plan={(subscription?.plan ?? "starter") as PlanId} onGoToAI={() => setActive("Vendeo AI")} onGoToAccounts={() => setActive("Comptes publicitaires")} onLaunchAd={launchAd} storeId={activeStoreId} campaignsVersion={campaignsVersion} />
           ) : active === "Comptes publicitaires" ? (
            <MobileSettingsView onNavigate={setActive} onSignOut={signOut} plan={(subscription?.plan ?? "starter") as PlanId} focus="channels" />
          ) : active === "Radar marché" ? (
             <MarketRadarView onGoToAI={(prompt) => { sessionStorage.setItem(SESSION_STORAGE_PROMPT_KEY, prompt); setActive("Vendeo AI"); }} />
           ) : active === "Mes boutiques" ? (
            <StoresView stores={stores} subscription={subscription} onStoresChange={setStores} onBackToSettings={backToAccountSettings} />
          ) : active === "Abonnement" ? (
            <SubscriptionView subscription={subscription} onBackToSettings={backToAccountSettings} />
          ) : active === "Bénéfices nets" ? (
            <ProductProfitPanel key={activeStoreId} storeId={activeStoreId} />
          ) : active === "Relances WhatsApp" ? (
            <RecoveryPanel key={activeStoreId} storeId={activeStoreId} />
          ) : active === "Rapports" ? (
            <Reports stores={stores} analytics={analytics} selectedStoreId={selectedStoreId} />
          ) : active === "Suggestions et notes" ? (
            <MobileSettingsView onNavigate={setActive} onSignOut={signOut} plan={(subscription?.plan ?? "starter") as PlanId} focus="feedback" />
          ) : active === "Notifications" ? (
            <NotificationsView onBack={() => setActive(previousSection)} />
          ) : (
            <OverviewHome
              key={activeStoreId}
              stores={stores}
              subscription={subscription}
              analytics={analytics}
              rolling30Analytics={dashboardAnalyticsData?.rolling30Snapshot ?? null}
              selectedPeriodAnalytics={dashboardAnalyticsData?.periodSnapshot ?? null}
              selectedPeriodLoading={analyticsReading.loading && overviewPeriodDays !== 30}
              userFirstName={userFirstName}
              plan={(subscription?.plan ?? "starter") as PlanId}
              selectedStoreId={selectedStoreId}
              onLaunchAd={launchAd}
              onPromoteProduct={promoteProduct}
              campaignsVersion={campaignsVersion}
              selectedPeriodDays={overviewPeriodDays}
              onPeriodDaysChange={setOverviewPeriodDays}
              onNavigate={setActive}
              loading={storeDataLoading}
              storeSelector={<div className="dashboard-overview-mobile-store" data-onboarding="store"><DashboardStoreSelector mobile stores={stores} selectedStoreId={activeStoreId} onChange={changeStore} loading={loadingData} /></div>}
            />
          )}
         </section>
         {wizardOpen && activeStoreId ? (
           <LaunchAdWizard
             key={`${activeStoreId}:${wizardProduct?.id ?? ""}:${wizardDuplicateCampaign?.id ?? ""}`}
             storeId={activeStoreId}
             initialProduct={wizardProduct}
             duplicateCampaign={wizardDuplicateCampaign ?? undefined}
             launchImmediately={Boolean(wizardDuplicateCampaign)}
             plan={(subscription?.plan ?? "starter") as PlanId}
             onClose={() => { setWizardOpen(false); setWizardProduct(null); setWizardDuplicateCampaign(null); }}
             onLaunched={() => { navigationCache.invalidate(); setCampaignsVersion((v) => v + 1); }}
           />
         ) : null}
      </div>


        {active !== "Paramètres" ? (
         <>
          <nav className={`mobile-nav${active === "Mes boutiques" ? " mobile-nav-hidden-on-stores" : ""}${mobileNavVisible ? " mobile-nav-visible" : " mobile-nav-hidden"}`} aria-label={w("mobileNav")}>
            <button type="button" data-onboarding="Vue d'ensemble" aria-current={active === "Vue d'ensemble" ? "page" : undefined} className={`nav-btn ${active === "Vue d'ensemble" ? "active" : ""}`} onClick={() => setActive("Vue d'ensemble")}>
              <Grid2X2 size={24} strokeWidth={2} aria-hidden="true" />
              <span>{locale === "en" ? "Home" : "Accueil"}</span>
            </button>
            <button type="button" data-onboarding="Pub" aria-current={active === "Pub" ? "page" : undefined} className={`nav-btn ${active === "Pub" ? "active" : ""}`} onClick={() => setActive("Pub")}>
              <Megaphone size={24} strokeWidth={2} aria-hidden="true" />
              <span>{locale === "en" ? "Ads" : "Pub"}</span>
            </button>
            <button type="button" data-onboarding="Vendeo AI" aria-label={locale === "en" ? "Assistant" : "Assistant"} title={locale === "en" ? "Assistant" : "Assistant"} aria-current={active === "Vendeo AI" ? "page" : undefined} className={`nav-btn ${active === "Vendeo AI" ? "active" : ""}${guideAssistantHighlight ? " nav-btn-guide-highlight" : ""}`} onClick={() => setActive("Vendeo AI")}>
              <Brain size={24} strokeWidth={2} aria-hidden="true" />
              <span>{locale === "en" ? "Assistant" : "Assistant"}</span>
            </button>
            <button type="button" data-onboarding="Studio" aria-current={active === "Studio" ? "page" : undefined} className={`nav-btn nav-btn-studio ${active === "Studio" ? "active" : ""}`} onClick={() => setActive("Studio")}>
              <Palette size={26} strokeWidth={2} aria-hidden="true" />
              <span>{locale === "en" ? "Studio" : "Studio"}</span>
            </button>
            <button type="button" data-onboarding="Performance publicitaire" aria-label={hasNewRecommendation ? (locale === "en" ? "Recommendation, new suggestion" : "Recommandation, nouvelle proposition") : undefined} title={locale === "en" ? "Recommendations" : "Recommandation"} aria-current={active === "Performance publicitaire" ? "page" : undefined} className={`nav-btn nav-btn-recommendation ${active === "Performance publicitaire" ? "active" : ""}${hasNewRecommendation ? " nav-btn-has-notification" : ""}`} onClick={() => setActive("Performance publicitaire")}>
              <BarChart3 size={24} strokeWidth={2} aria-hidden="true" />
              <span>{locale === "en" ? "Recommendations" : "Recommandation"}</span>
            </button>
          </nav>
         </>
        ) : null}
         {moreOpen ? (
          <>
            <button type="button" className="mobile-more-backdrop" aria-label={w("closeMenu")} onClick={() => setMoreOpen(false)} />
            <div className="mobile-more-menu" role="menu" aria-label={w("moreOptions")}>
              <span className="mobile-more-label">{w("myActivity")}</span>
              <button type="button" role="menuitem" data-onboarding="mobile-menu:Bénéfices nets" aria-current={active === "Bénéfices nets" ? "page" : undefined} className={mobileMoreItemClass("Bénéfices nets")} onClick={() => { setActive("Bénéfices nets"); setMoreOpen(false); }}><BarChart3 size={16} /> {w("netProfit")}</button>
              <button type="button" role="menuitem" data-onboarding="mobile-menu:Relances WhatsApp" aria-current={active === "Relances WhatsApp" ? "page" : undefined} className={mobileMoreItemClass("Relances WhatsApp")} onClick={() => { setActive("Relances WhatsApp"); setMoreOpen(false); }}><MessageSquare size={16} /> {w("whatsapp")}</button>
              <span className="mobile-more-label">{w("analysis")}</span>
              <button type="button" role="menuitem" data-onboarding="mobile-menu:Radar marché" aria-current={active === "Radar marché" ? "page" : undefined} className={mobileMoreItemClass("Radar marché")} onClick={() => { setActive("Radar marché"); setMoreOpen(false); }}><Lightbulb size={16} /> {locale === "en" ? "Market radar" : "Radar marché"}</button>
              <button type="button" role="menuitem" data-onboarding="mobile-menu:Performance publicitaire" aria-current={active === "Performance publicitaire" ? "page" : undefined} className={mobileMoreItemClass("Performance publicitaire")} onClick={() => { setActive("Performance publicitaire"); setMoreOpen(false); }}><BarChart3 size={16} /> {t("nav.adPerformance")}</button>
              <button type="button" role="menuitem" data-onboarding="mobile-menu:Rapports" aria-current={active === "Rapports" ? "page" : undefined} className={mobileMoreItemClass("Rapports")} onClick={() => { setActive("Rapports"); setMoreOpen(false); }}><FileText size={16} /> {" "}{t("workspaceExtra.reports")}</button>
              <span className="mobile-more-label">{w("application")}</span>
              <button type="button" role="menuitem" data-onboarding="mobile-menu:Paramètres" aria-current={active === "Paramètres" ? "page" : undefined} className={mobileMoreItemClass("Paramètres")} onClick={openSettingsIndex}><Settings size={16} /> {" "}{t("workspaceExtra.settings")}</button>
            </div>
          </>
        ) : null}
      </div>
    </main>
    {needsStoreConnection && <StoreConnectionGate stores={stores} failed={["failed", "expired", "revoked"].includes(searchParams.get("chariow") ?? "")} onSignOut={signOut} onConnectStart={onboarding.beginConnection} />}
    {onboardingOpen && <FirstStoreWelcome stage={onboarding.stage as "welcome" | "tour"} subscription={subscription} onStart={() => { setActive(DEFAULT_DASHBOARD_SECTION); setMoreOpen(false); setGuideMenuTarget(null); onboarding.startTour(); }} onDismiss={() => { handleTourStepChange(null); onboarding.dismiss(); }} onTourStepChange={handleTourStepChange} />}
    </>
  );
}
