"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BarChart3, CreditCard, Plus, Settings, Store, MessageSquare, LayoutDashboard, Package, CalendarDays, Users, Eye, ShoppingBag, Lightbulb, Activity, AlertTriangle, Target, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useSearchParams } from "next/navigation";

const SESSION_STORAGE_PROMPT_KEY = "vendeo_ai_prompt";

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
  trial_active?: boolean;
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
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);

  const userFirstName = (userName || "créateur").trim().split(/\s+/)[0] ?? "créateur";
  const freeUsed = subscription?.free_messages_used ?? 0;
  const freeLimit = subscription?.free_messages_limit ?? 3;
  const used = subscription?.messages_used_this_month ?? 0;
  const limit = subscription?.messages_limit ?? 400;
  const remainingAiThisMonth = freeUsed < freeLimit ? Math.max(0, freeLimit - freeUsed) : Math.max(0, limit - used);

  const links = [
    ["Vue d’ensemble", LayoutDashboard],
    ["Vendeo AI", MessageSquare],
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
              Plan {subscription?.plan === "pro" ? "Pro" : "Starter"}
            </span>
            <p style={{ fontSize: 11, lineHeight: 1.5, margin: "9px 0", color: "#334155" }}>Passe au Pro pour débloquer les rapports.</p>
            <button className="btn btn-dark" style={{ fontSize: 10, padding: "8px 10px", width: "100%" }}>Passer au Pro</button>
          </div>

          <div className="side-usage">
            <div className="side-usage-label">Usage IA ce mois</div>
            <div className="side-usage-value">{remainingAiThisMonth.toLocaleString("fr-FR")} messages disponibles</div>
          </div>
        </aside>
        <section className="app-main">
          {loadingData ? (
            <div className="app-card">Chargement de ton espace…</div>
          ) : stores.length === 0 && active !== "Mes boutiques" ? (
            <StoreOnboarding />
          ) : active === "Vendeo AI" ? (
            <ChatView onGoToSubscription={() => setActive("Abonnement")} />
          ) : active === "Mes boutiques" ? (
            <StoresView stores={stores} onStoresChange={setStores} />
          ) : active === "Abonnement" ? (
            <SubscriptionView subscription={subscription} />
          ) : active === "Rapports" ? (
            <Reports stores={stores} analytics={analytics} />
          ) : (
            <Overview
              stores={stores}
              subscription={subscription}
              analytics={analytics}
              userFirstName={userFirstName}
              onGoToAI={() => setActive("Vendeo AI")}
            />
          )}
        </section>
      </div>

       <nav className="mobile-nav" aria-label="Navigation mobile">
        <button type="button" className={`nav-btn ${active === "Vue d’ensemble" ? "active" : ""}`} onClick={() => setActive("Vue d’ensemble")}>
          <LayoutDashboard size={18} />
          <span>Accueil</span>
        </button>
         <button type="button" className={`nav-btn ${active === "Vendeo AI" ? "active" : ""}`} onClick={() => setActive("Vendeo AI")}>
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

function Overview({
  stores,
  subscription,
  analytics,
  userFirstName,
  onGoToAI,
}: {
  stores: StoreData[];
  subscription: SubscriptionData | null;
  analytics: AnalyticsData;
  userFirstName: string;
  onGoToAI: () => void;
}) {
  const isChariowConnected = stores?.[0]?.connection_status === "connected";

  const catalogProducts = analytics?.products ?? [];
  const productsTotal = catalogProducts.length;
  const publishedProducts = catalogProducts
    .filter((p) => {
      const status = (p.status ?? "").toString().toLowerCase();
      return status.includes("published") || status.includes("publié") || status.includes("publiée");
    })
    .map((p) => ({
      title: p.name,
      priceAvailable: p.price !== null && p.price !== "" && p.price !== undefined,
    }));

  const publishedCount = publishedProducts.length;
  const firstPublishedTitle = publishedProducts[0]?.title ?? "";
  const firstPublishedPriceAvailable = publishedProducts[0]?.priceAvailable ?? false;

  const visitsTotal = analytics?.kpis?.visits ?? 0;
  const salesCount = analytics?.kpis?.sales ?? 0;
  const revenueFormatted = analytics?.kpis?.revenue?.formatted ?? "0";
  const conversionFormatted = analytics?.kpis?.conversionRate ?? "0 %";
  const customersTotal = analytics?.kpis?.customers ?? 0;
  const productsSold = analytics?.kpis?.productsSold ?? 0;

  const summaryText = (() => {
    if (isChariowConnected && publishedCount >= 1 && visitsTotal === 0) {
      return "Ta boutique est bien connectée et ton premier produit est publié. Ton principal défi est maintenant d’attirer tes premiers visiteurs. Concentre-toi cette semaine sur la promotion de ton produit auprès d’une audience précise.";
    }
    if (!isChariowConnected) return "Connecte ta boutique Chariow pour recevoir des recommandations personnalisées.";
    if (publishedCount < 1) return "Publie ton premier produit pour que Vendeo puisse proposer des actions concrètes.";
    if (visitsTotal > 0 && salesCount === 0) return "Tu as déjà des visites. L’enjeu maintenant est d’améliorer la page produit et la promesse pour favoriser la première vente.";
    return "Ta boutique est connectée. Continue tes actions de promotion et observe l’impact sur les visites et les ventes.";
  })();

  const buildPrompt = (kind: "tiktok" | "whatsapp" | "productPage" | "salesPlan") => {
    const title = firstPublishedTitle || "mon produit";
    const map = {
      tiktok: "Crée un script TikTok court et convaincant pour promouvoir mon produit : ${product.title}. Mon objectif est d’obtenir mes premières visites et mes premières ventes.",
      whatsapp: "Crée une publication WhatsApp courte et convaincante pour promouvoir mon produit : ${product.title}. Mon objectif est d’obtenir mes premières visites et mes premières ventes.",
      productPage: "Aide-moi à améliorer la page de vente de mon produit ${product.title}. Propose une promesse forte, une description claire, les bénéfices, une structure de page et un appel à l’action.",
      salesPlan: "Crée un plan d’action simple sur 7 jours pour obtenir mes premières visites et ma première vente pour mon produit ${product.title}. Je cible les créateurs et entrepreneurs francophones.",
    } as const;
    return map[kind].replace(/\$\{product\.title\}/g, title);
  };

  const openAIWithPrompt = (prompt: string) => {
    sessionStorage.setItem(SESSION_STORAGE_PROMPT_KEY, prompt);
    onGoToAI();
  };

  const primaryPublished = publishedCount >= 1;
  const priceAvailable = firstPublishedPriceAvailable;

  const card1 = (() => {
    if (visitsTotal === 0) {
      return {
        title: "Obtiens tes premiers visiteurs",
        body: "Ta boutique est prête. La prochaine étape est d’attirer tes premiers visiteurs.",
        primaryAction: { label: "TikTok", promptKind: "tiktok" as const },
        secondaryAction: { label: "WhatsApp", promptKind: "whatsapp" as const },
      };
    }
    return {
      title: "Obtiens tes premiers visiteurs",
      body: "Tu as déjà des visites. Continue la promotion pour créer des signaux vers ta première vente.",
      primaryAction: { label: "TikTok", promptKind: "tiktok" as const },
      secondaryAction: { label: "WhatsApp", promptKind: "whatsapp" as const },
    };
  })();

  const card2 = (() => {
    if (!primaryPublished) {
      return {
        title: "Renforce ta page de vente",
        body: "Ton produit n’est pas encore publié. Publie-le pour que Vendeo puisse affiner les recommandations sur ta page de vente.",
        primaryAction: { label: "Améliorer ma page produit", promptKind: "productPage" as const },
      };
    }
    if (!priceAvailable) {
      return {
        title: "Renforce ta page de vente",
        body: "Ton produit est publié, mais son prix n’est pas disponible dans les données synchronisées. Vérifie que son prix, sa promesse et ses bénéfices sont clairement affichés…",
        primaryAction: { label: "Améliorer ma page produit", promptKind: "productPage" as const },
      };
    }
    return {
      title: "Renforce ta page de vente",
      body: "Ton produit est publié. On va optimiser la page pour que la promesse et les bénéfices soient immédiatement clairs.",
      primaryAction: { label: "Améliorer ma page produit", promptKind: "productPage" as const },
    };
  })();

  const card3 = (() => {
    if (productsTotal === 1 && primaryPublished) {
      return {
        title: "Prépare ton premier objectif",
        body: "Objectif : obtenir premières visites + première vente cette semaine.",
        primaryAction: { label: "Créer mon plan de vente", promptKind: "salesPlan" as const },
      };
    }
    return {
      title: "Prépare ton premier objectif",
      body: "Crée un objectif simple basé sur tes signaux actuels. (V1 prudente : une action de plan quand un produit est publié.)",
      primaryAction: { label: "Créer mon plan de vente", promptKind: "salesPlan" as const },
    };
  })();

  const productCard = (() => {
    const product = catalogProducts.find((p) => {
      const status = (p.status ?? "").toString().toLowerCase();
      return status.includes("published") || status.includes("publié") || status.includes("publiée");
    }) ?? catalogProducts[0];

    if (!product) return null;
    const status = (product.status ?? "").toString().toLowerCase();
    const isPublished = status.includes("published") || status.includes("publié") || status.includes("publiée");
    const priceAvailable = product.price !== null && product.price !== "" && product.price !== undefined;
    const priceText = priceAvailable
      ? `${product.price}${product.currency ? ` ${product.currency}` : ""}`
      : "Prix non disponible dans les données synchronisées.";

    return {
      title: product.name,
      statusLabel: isPublished ? "Publié" : "Non publié",
      priceText,
    };
  })();

  const performanceMessage = (() => {
    if (visitsTotal === 0) return "Ta priorité cette semaine : attirer tes premiers visiteurs pour déclencher des signaux utiles.";
    if (salesCount === 0) return "Tu as des visites : concentre-toi sur une page produit claire et une promesse forte pour obtenir ta première vente.";
    return "Continue l’optimisation : teste des variations et observe l’évolution des visites et des ventes.";
  })();

  const progress = [
    { label: "Boutique Chariow connectée", done: isChariowConnected },
    { label: "Produit publié", done: primaryPublished },
    { label: "Premiers visiteurs", done: visitsTotal > 0 },
    { label: "Première vente", done: salesCount > 0 },
  ];

  const greeting = (userFirstName || "créateur").trim().split(/\s+/)[0] || "créateur";

  if (!stores.length) {
    return (
      <>
        <div className="vendeo-overview-header">
          <div>
            <h1>Bonjour {greeting} 👋</h1>
            <p>Voici ce que Vendeo recommande pour faire avancer ton business cette semaine.</p>
          </div>
          <div className="vendeo-badge">✅ Boutique Chariow connectée</div>
        </div>
        <div className="empty-state" style={{ marginTop: 12 }}>Connecte ta boutique Chariow pour voir tes recommandations.</div>
      </>
    );
  }

  if (!analytics || !isChariowConnected) {
    const badgeText = stores?.[0]?.connection_status === "connected" ? "✅ Boutique Chariow connectée" : "⏳ Connexion Chariow requise";
    return (
      <>
        <div className="vendeo-overview-header">
          <div>
            <h1>Bonjour {greeting} 👋</h1>
            <p>Voici ce que Vendeo recommande pour faire avancer ton business cette semaine.</p>
          </div>
          <div className="vendeo-badge">{badgeText}</div>
        </div>
        <div className="empty-state" style={{ marginTop: 12 }}>Connecte ta boutique Chariow pour afficher tes recommandations.</div>
      </>
    );
  }

  return (
    <>
      <div className="vendeo-overview-header">
        <div>
          <h1>Bonjour {greeting} 👋</h1>
          <p>Voici ce que Vendeo recommande pour faire avancer ton business cette semaine.</p>
        </div>
        <div className="vendeo-badge">✅ Boutique Chariow connectée</div>
      </div>

      <section className="vendeo-section" aria-label="Priorités">
        <div className="vendeo-section-head">
          <div className="vendeo-section-icon">🎯</div>
          <h2>Tes priorités cette semaine</h2>
        </div>

        <div className="vendeo-priorities-grid">
          <div className="vendeo-priority-card">
            <h3>{card1.title}</h3>
            <p className="vendeo-muted">{card1.body}</p>
            <div className="vendeo-card-actions">
              <button className="btn btn-lime" onClick={() => openAIWithPrompt(buildPrompt(card1.primaryAction.promptKind))}>
                Créer un script TikTok
              </button>
              <button className="btn btn-ghost" onClick={() => openAIWithPrompt(buildPrompt(card1.secondaryAction.promptKind))}>
                Créer une publication WhatsApp
              </button>
            </div>
          </div>

          <div className="vendeo-priority-card">
            <h3>{card2.title}</h3>
            <p className="vendeo-muted">{card2.body}</p>
            <div className="vendeo-card-actions">
              <button className="btn btn-lime" onClick={() => openAIWithPrompt(buildPrompt(card2.primaryAction.promptKind))}>
                {card2.primaryAction.label}
              </button>
            </div>
          </div>

          <div className="vendeo-priority-card">
            <h3>{card3.title}</h3>
            <p className="vendeo-muted">{card3.body}</p>
            <div className="vendeo-card-actions">
              <button className="btn btn-lime" onClick={() => openAIWithPrompt(buildPrompt(card3.primaryAction.promptKind))}>
                {card3.primaryAction.label}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="vendeo-section" aria-label="Résumé">
        <div className="vendeo-section-head">
          <div className="vendeo-section-icon">🧠</div>
          <h2>Ce que Vendeo a compris</h2>
        </div>
        <div className="vendeo-resume-card">{summaryText}</div>
      </section>

      <section className="vendeo-section" aria-label="Performance">
        <div className="vendeo-section-head">
          <div className="vendeo-section-icon">📈</div>
          <h2>Performance de ta boutique</h2>
        </div>

        <div className="vendeo-kpi-grid">
          <div className="vendeo-kpi">
            <small>Chiffre d’affaires</small>
            <strong>{revenueFormatted}</strong>
          </div>
          <div className="vendeo-kpi">
            <small>Ventes</small>
            <strong>{salesCount}</strong>
          </div>
          <div className="vendeo-kpi">
            <small>Visites</small>
            <strong>{visitsTotal}</strong>
          </div>
          <div className="vendeo-kpi">
            <small>Conversion</small>
            <strong>{conversionFormatted}</strong>
          </div>
          <div className="vendeo-kpi">
            <small>Clients</small>
            <strong>{customersTotal}</strong>
          </div>
          <div className="vendeo-kpi vendeo-kpi-wide">
            <small>Produits du catalogue</small>
            <strong>{productsTotal}</strong>
          </div>
        </div>

        <p className="vendeo-muted" style={{ margin: "12px 0 0" }}>{performanceMessage}</p>
      </section>

      <section className="vendeo-section" aria-label="Produit">
        <div className="vendeo-section-head">
          <div className="vendeo-section-icon">🛍️</div>
          <h2>Ton produit à promouvoir</h2>
        </div>

        <div className="vendeo-product-card">
          {productCard ? (
            <>
              <div className="vendeo-product-row">
                <div>
                  <div className="vendeo-muted">Nom</div>
                  <div className="vendeo-product-title">{productCard.title}</div>
                </div>
                <div>
                  <div className="vendeo-muted">Statut</div>
                  <div className="vendeo-product-status">{productCard.statusLabel}</div>
                </div>
                <div>
                  <div className="vendeo-muted">Prix</div>
                  <div className="vendeo-product-price">{productCard.priceText}</div>
                </div>
              </div>
              {!firstPublishedPriceAvailable ? (
                <div className="vendeo-product-hint">Prix non disponible dans les données synchronisées.</div>
              ) : null}
            </>
          ) : (
            <div className="empty-state compact">Aucun produit trouvé dans ta boutique Chariow.</div>
          )}
        </div>
      </section>

      <section className="vendeo-section" aria-label="Chemin">
        <div className="vendeo-section-head">
          <div className="vendeo-section-icon">🚀</div>
          <h2>Ton chemin vers ta première vente</h2>
        </div>

        <div className="vendeo-progress">
          {progress.map((step) => (
            <div key={step.label} className="vendeo-progress-step">
              <span className="vendeo-step-check">{step.done ? "✅" : "○"}</span>
              <span>{step.label}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
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
    </div>
    <div className="signal-action app-card"><div className="card-head"><div><span className="eyebrow">Prochaine action</span><h2>Ton meilleur levier</h2></div><Target size={18} color="#34684d" /></div><strong>{recommendation.title}</strong><p>{recommendation.description}</p><div className="signal-meta">{products.length} produit{products.length > 1 ? "s" : ""} · {kpis.sales} vente{kpis.sales > 1 ? "s" : ""} · {kpis.visits} visite{kpis.visits > 1 ? "s" : ""}</div></div>
  </div>;
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
        <section className="app-card report-section"><div className="card-head"><div><span className="eyebrow">Inventaire et performance</span><h2>Détail des produits</h2></div><strong>{analytics.products.length} produit{analytics.products.length > 1 ? "s" : ""}</strong></div>{analytics.products.length === 0 ? <p className="report-muted">Aucun produit trouvé dans ton catalogue.</p> : <div className="report-table"><div className="report-table-head"><span>Produit</span><span>Statut</span><span>Ventes</span></div>{analytics.products.map((product) => <div className="report-table-row" key={product.id}><div className="report-product"><span className="report-product-icon">{product.image ? <img src={product.image} alt="" /> : <Package size={16} />}</span><span><strong title={product.name}>{product.name}</strong><small>{formatProductPrice(product)}</small></span></div><span className="report-status">{product.status ?? "Non renseigné"}</span><strong>{product.sales ?? 0}</strong></div>)}</div>}</section>
        <section className="app-card report-section"><div className="card-head"><div><span className="eyebrow">Lecture rapide</span><h2>À retenir</h2></div><Lightbulb size={18} color="#d28b3d" /></div><div className="report-insight"><strong>{kpis.sales === 0 ? "Pas encore de ventes" : "Ton activité commerciale"}</strong><p>{kpis.sales === 0 ? "Teste un partage ciblé de ton produit et observe les visites sur la prochaine période." : "Compare cette période à la précédente pour identifier les produits qui tirent ta croissance."}</p></div><div className="report-insight"><strong>{kpis.visits === 0 ? "Aucune visite enregistrée" : `${kpis.visits} visite${kpis.visits > 1 ? "s" : ""} observée${kpis.visits > 1 ? "s" : ""}`}</strong><p>{kpis.visits === 0 ? "Ta prochaine priorité est d’amener du trafic vers ta boutique." : `Le taux de conversion actuel est de ${kpis.conversionRate}.`}</p></div></section>
      </div>
      <div className="app-card report-conclusion"><div className="card-head"><div><span className="eyebrow">Conclusion Vendeo</span><h2>Ce que tu dois retenir</h2></div><Target size={18} color="#34684d" /></div><div className="conclusion-grid"><div><small>Ce qui s’est passé</small><strong>{kpis.sales === 0 && kpis.visits === 0 ? "La période est encore calme." : `${kpis.sales} vente${kpis.sales > 1 ? "s" : ""} pour ${kpis.visits} visite${kpis.visits > 1 ? "s" : ""}.`}</strong></div><div><small>Pourquoi c’est important</small><strong>{kpis.visits === 0 ? "Sans trafic, aucune conversion n’est possible." : kpis.sales === 0 ? "Le prochain enjeu est de convertir tes visiteurs." : `La conversion actuelle est de ${kpis.conversionRate}.`}</strong></div><div><small>Prochaine action</small><strong>{getRecommendation(analytics).title}</strong></div></div></div>
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

function ChatView({ onGoToSubscription }: { onGoToSubscription: () => void }) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [usage, setUsage] = useState<{ free_used: number; free_limit: number; used: number; limit: number } | null>(null);
  const [plansRequired, setPlansRequired] = useState(false);

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
              limit: data.subscription.messages_limit,
            }
          : null;
        setUsage(nextUsage);
        if (nextUsage) setPlansRequired(nextUsage.free_used >= nextUsage.free_limit);
      });
  }, []);

  useEffect(() => {
    // Auto-scroll to the latest message.
    if (!bottomNode) return;
    bottomNode.scrollIntoView({ behavior: "smooth", block: "end" });
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
          limit: data.usage.limit,
        };
        setUsage(nextUsage);
        setPlansRequired(nextUsage.free_used >= nextUsage.free_limit);
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
    <>
      <div className="page-top">
        <div>
          <span className="eyebrow">Vendeo AI</span>
          <h1>On regarde ça ensemble ?</h1>
          <p>Pose une question sur tes ventes, tes produits ou ta stratégie.</p>
        </div>
      </div>
      <div className="app-card" style={{ maxWidth: 760, minHeight: 480, display: "flex", flexDirection: "column" }}>
        {usage && (
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

          <div ref={setBottomNode} />
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
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function connectChariow(storeId?: string) {
    setError("");
    setSaving(true);
    try {
      const existingStoreId = storeId ?? stores.find((store) => store.platform === "chariow")?.id;
      if (!existingStoreId) {
        const check = await fetch("/api/integrations/chariow/connect/check");
        const checkData = await check.json().catch(() => ({}));
        if (!check.ok) {
          if (checkData.code === "STORE_LIMIT") setShowUpgrade(true);
          else setError(checkData.error ?? "Impossible de lancer la connexion Chariow.");
          return;
        }
      }
      const target = existingStoreId
        ? `/api/integrations/chariow/connect?store_id=${encodeURIComponent(existingStoreId)}`
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
          <p>Une source de vérité pour toutes tes ventes.</p>
        </div>
        <button type="button" className="btn btn-dark" onClick={() => connectChariow()} disabled={saving}>
          <Plus size={16} /> {saving ? "Connexion…" : "Connecter ma boutique Chariow"}
        </button>
      </div>

      {error && <p className="store-error" role="alert">{error}</p>}

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
                  {status === "failed" || status === "expired" ? "Reconnecter Chariow" : "Connecter ma boutique Chariow"}
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

function SubscriptionView({ subscription }: { subscription: SubscriptionData | null }) {
  const plan = subscription?.plan ?? "starter";
  const trial = subscription?.trial_active ?? true;
  const isStarter = plan === "starter";

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
          <span className="eyebrow">{trial && isStarter ? "Essai gratuit" : !trial && isStarter ? "Plan actuel" : "Plan disponible"}</span>
          <h3>Starter</h3>
          <div className="price">3 000 F <small>/ mois</small></div>
          <ul>
            <li>✓ 400 messages IA / mois</li>
            <li>✓ 1 boutique connectée</li>
            <li>✓ Support standard</li>
          </ul>
          <button
            className="btn btn-ghost"
            disabled={isStarter}
            onClick={() => changePlan("starter")}
            style={{ width: "100%" }}
          >
            {trial && isStarter ? "Essai gratuit en cours" : "Plan actuel"}
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
          <button className="btn btn-lime" disabled={plan === "pro" && !trial} onClick={() => changePlan("pro")} style={{ width: "100%" }}>
            {plan === "pro" && !trial ? "Plan actuel" : "Passer au Pro"}
          </button>
        </article>
      </div>
    </>
  );
}
