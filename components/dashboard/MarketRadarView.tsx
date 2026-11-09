"use client";

import { useRef, useState, type FormEvent } from "react";
import { Activity, CalendarDays, Lightbulb, Loader2, PackageOpen, ShieldAlert, TrendingUp, UsersRound } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import type { MarketRadarFormat, MarketRadarProductContext, MarketRadarReport } from "@/lib/market-radar";

type RadarResponse = { report?: MarketRadarReport; error?: string };
type ChariowStore = { id: string; store_name: string | null; platform: string; connection_status: string | null };
type CatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number | string | null;
  currency: string | null;
  image: string | null;
  url: string | null;
};

type StoreListResponse = { stores?: ChariowStore[] };
type CatalogResponse = { products?: CatalogProduct[]; error?: string };
type RadarMode = "existing" | "new";

export function MarketRadarView({ onGoToAI }: { onGoToAI: (prompt: string) => void }) {
  const { t, locale } = useI18n();
  const [analysisMode, setAnalysisMode] = useState<RadarMode | null>(null);
  const [idea, setIdea] = useState("");
  const [format, setFormat] = useState<MarketRadarFormat>("ebook");
  const [report, setReport] = useState<MarketRadarReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [catalogInitialized, setCatalogInitialized] = useState(false);
  const [stores, setStores] = useState<ChariowStore[]>([]);
  const [storeId, setStoreId] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [storesLoading, setStoresLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const catalogRequest = useRef(0);

  const loadProductsForStore = async (nextStoreId: string) => {
    if (!nextStoreId) return;
    const requestId = ++catalogRequest.current;
    setStoreId(nextStoreId);
    setSelectedProduct(null);
    setIdea("");
    setProducts([]);
    setProductsLoading(true);
    setCatalogError("");
    setReport(null);
    try {
      const response = await fetch(`/api/market/radar/catalog?store_id=${encodeURIComponent(nextStoreId)}`, { cache: "no-store" });
      const data = await response.json() as CatalogResponse;
      if (!response.ok) throw new Error(data.error || "catalog");
      if (requestId === catalogRequest.current) setProducts(Array.isArray(data.products) ? data.products : []);
    } catch {
      if (requestId === catalogRequest.current) {
        setCatalogError(t("radar.catalogError"));
        setCatalogInitialized(false);
      }
    } finally {
      if (requestId === catalogRequest.current) setProductsLoading(false);
    }
  };

  const loadCatalog = async (force = false) => {
    if (catalogInitialized && !force) return;
    setCatalogInitialized(true);
    setStoresLoading(true);
    setCatalogError("");
    try {
      const response = await fetch("/api/stores", { cache: "no-store" });
      const data = await response.json() as StoreListResponse;
      if (!response.ok) throw new Error("stores");
      const connected = (Array.isArray(data.stores) ? data.stores : [])
        .filter((store) => store.platform === "chariow" && store.connection_status === "connected");
      setStores(connected);
      if (connected.length) await loadProductsForStore(connected[0].id);
    } catch {
      setCatalogError(t("radar.catalogError"));
      setCatalogInitialized(false);
    } finally {
      setStoresLoading(false);
    }
  };

  const chooseMode = (nextMode: RadarMode) => {
    if (analysisMode === nextMode) return;
    setAnalysisMode(nextMode);
    setIdea("");
    setSelectedProduct(null);
    setReport(null);
    setError("");
    if (nextMode === "existing") void loadCatalog();
  };

  const productContext = (): MarketRadarProductContext | null => analysisMode === "existing" && selectedProduct ? ({
    name: selectedProduct.name,
    description: selectedProduct.description,
    category: null,
    type: null,
    price: selectedProduct.price === null ? null : String(selectedProduct.price),
    currency: selectedProduct.currency,
  }) : null;

  const minimumIdeaLength = 8;
  const isIdeaValid = idea.trim().length >= minimumIdeaLength;
  const canAnalyze = analysisMode === "existing" ? Boolean(selectedProduct) : analysisMode === "new" && isIdeaValid;

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAnalyze) return;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const response = await fetch("/api/market/radar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.trim(), product: productContext(), format, locale }),
      });
      const data = await response.json() as RadarResponse;
      if (!response.ok || !data.report || data.report.status === "ai_unavailable") {
        setError(data.error ?? t("radar.analysisError"));
        return;
      }
      setReport(data.report);
    } catch {
      setError(t("radar.analysisError"));
    } finally {
      setLoading(false);
    }
  }

  const confidenceLabel = report?.confidence === "medium" ? t("radar.confidenceMedium") : t("radar.confidenceLow");
  const scoreItems = report ? [
    { label: t("radar.dimensionDemand"), value: report.dimensions.demandPotential },
    { label: t("radar.dimensionAudience"), value: report.dimensions.audienceFit },
    { label: t("radar.dimensionProduct"), value: report.dimensions.productFit },
    { label: t("radar.dimensionMonetization"), value: report.dimensions.monetizationPotential },
  ] : [];
  const targetCountries = report?.recommendedCountries.map((country) => country.name).join(", ") || t("radar.noCountryContext");
  const dayLabels: Record<string, string> = {
    monday: t("radar.dayMonday"), tuesday: t("radar.dayTuesday"), wednesday: t("radar.dayWednesday"),
    thursday: t("radar.dayThursday"), friday: t("radar.dayFriday"), saturday: t("radar.daySaturday"), sunday: t("radar.daySunday"),
  };
  const trendLabels: Record<string, string> = {
    up: t("radar.trendUp"), down: t("radar.trendDown"), stable: t("radar.trendStable"),
    qualitative: t("radar.trendQualitative"), unknown: t("radar.trendUnknown"),
  };
  const metaInterestMessage = report?.targetAudience.metaInterestStatus === "not_connected"
    ? t("radar.metaConnectNote")
    : report?.targetAudience.metaInterestStatus === "unavailable"
      ? t("radar.metaUnavailable")
      : report?.targetAudience.metaInterestStatus === "no_matches"
        ? t("radar.metaNoMatches")
        : "";

  const workflow = <div className="market-radar-workflow">
    <section className="app-card market-radar-mode-picker">
      <div className="market-radar-mode-heading">
        <span className="eyebrow">{t("radar.modeQuestion")}</span>
        <p>{t("radar.modeHelp")}</p>
      </div>
      <div className="market-radar-mode-grid" role="group" aria-label={t("radar.modeQuestion")}>
        <button type="button" className="market-radar-mode-option" aria-pressed={analysisMode === "existing"} onClick={() => chooseMode("existing")}>
          <PackageOpen size={20} aria-hidden="true" />
          <span><strong>{t("radar.modeExistingTitle")}</strong><small>{t("radar.modeExistingText")}</small></span>
        </button>
        <button type="button" className="market-radar-mode-option" aria-pressed={analysisMode === "new"} onClick={() => chooseMode("new")}>
          <Lightbulb size={20} aria-hidden="true" />
          <span><strong>{t("radar.modeNewTitle")}</strong><small>{t("radar.modeNewText")}</small></span>
        </button>
      </div>
    </section>

    {analysisMode ? <form className="app-card market-radar-form" onSubmit={analyze}>
      {analysisMode === "existing" ? <div className="market-radar-catalog">
        <span className="market-radar-control-label">{t("radar.productSelectLabel")}</span>
        <div className="market-radar-catalog-panel">
          {storesLoading ? <small>{t("radar.catalogLoadingStores")}</small> : null}
          {!storesLoading && stores.length === 0 && !catalogError ? <small>{t("radar.catalogNoStores")}</small> : null}
          {stores.length > 1 ? <label>{t("radar.productStoreLabel")}
            <select value={storeId} onChange={(event) => void loadProductsForStore(event.target.value)} disabled={productsLoading}>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.store_name || t("radar.defaultStoreName")}</option>)}
            </select>
          </label> : null}
          {stores.length > 0 ? <label>{t("radar.productSelectLabel")}
            <select className="market-radar-product-select" value={selectedProduct?.id ?? ""} onChange={(event) => {
              const product = products.find((item) => item.id === event.target.value) ?? null;
              setSelectedProduct(product);
              setIdea(product?.name.slice(0, 180) ?? "");
              setReport(null);
              setError("");
            }} disabled={productsLoading || !products.length}>
              <option value="">{t("radar.productPlaceholder")}</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label> : null}
          {productsLoading ? <small>{t("radar.catalogLoadingProducts")}</small> : null}
          {!productsLoading && stores.length > 0 && storeId && products.length === 0 && !catalogError ? <small>{t("radar.catalogNoProducts")}</small> : null}
          {selectedProduct ? <small className="market-radar-selected-product">{t("radar.selectedProduct")}: {selectedProduct.name}</small> : null}
          {catalogError ? <div className="market-radar-catalog-error"><small>{catalogError}</small><button type="button" className="btn btn-ghost" onClick={() => void loadCatalog(true)}>{t("radar.retryCatalog")}</button></div> : null}
        </div>
      </div> : <label className="market-radar-idea-field">
        <span>{t("radar.ideaLabel")}</span>
        <input
          value={idea}
          maxLength={180}
          onChange={(event) => { setIdea(event.target.value); setReport(null); }}
          placeholder={t("radar.ideaPlaceholder")}
          aria-describedby="market-radar-idea-hint"
        />
        <small id="market-radar-idea-hint" className={idea.trim().length > 0 && !isIdeaValid ? "is-invalid" : ""}>{t("radar.ideaHint")}</small>
      </label>}

      <div className="market-radar-fields">
        <label>{t("radar.formatLabel")}
          <select className="market-radar-format-select" value={format} onChange={(event) => { setFormat(event.target.value as MarketRadarFormat); setReport(null); }}>
            <option value="ebook">E-book</option>
            <option value="formation">{t("radar.formatTraining")}</option>
            <option value="template">{t("radar.formatTemplates")}</option>
            <option value="abonnement">{t("radar.formatSubscription")}</option>
          </select>
        </label>
      </div>
      {error ? <p className="store-error">{error}</p> : null}
      <button className="btn btn-dark" disabled={loading || !canAnalyze}>
        {loading ? <><Loader2 size={16} className="market-radar-spinner" /> {t("radar.analyzing")}</> : t("radar.analyze")}
      </button>
      {loading ? <small className="market-radar-loading-note">{t("radar.recommendationsLoading")}</small> : null}
    </form> : null}
  </div>;

  return <div className="market-radar-page">
    <div className="page-top">
      <div><h1>{t("radar.eyebrow")}</h1><p>{t("radar.subtitle")}</p></div>
    </div>

    <section className="market-radar-hero">
      <div>
        <span className="eyebrow">{t("radar.heroEyebrow")}</span>
        <h2>{t("radar.heroTitle")}</h2>
        <p>{t("radar.heroText")}</p>
      </div>
      <TrendingUp size={32} aria-hidden="true" />
    </section>

    {report ? <details className="app-card market-radar-edit">
      <summary>{t("radar.editAnalysis")}</summary>
      {workflow}
    </details> : workflow}

    {report ? <>
      <section className="market-radar-score">
        <div className="market-radar-score-summary">
          <span className="eyebrow">{t("radar.scoreTitle")}</span>
          {report.score === null
            ? <strong className="market-radar-no-score">—</strong>
            : <strong>{report.score}<small>/100</small></strong>}
          <p>{report.scoreRationale}</p>
          <small className="market-radar-basis">{report.analysisMode === "crossed" ? t("radar.crossedAnalysis") : t("radar.qualitativeAnalysis")} · {t("radar.confidenceLabel")}: {confidenceLabel}</small>
        </div>
        <div>
          <div className="market-dimension-grid">
            {scoreItems.map(({ label, value }) => <div key={label} className={value === null ? "is-unmeasured" : ""}>
              <small>{label}</small>
              <strong>{value === null ? "—" : value}</strong>
              {value === null ? <span>{t("radar.notMeasured")}</span> : <i><b style={{ width: `${value}%` }} /></i>}
            </div>)}
          </div>
          <div className="market-trend">
            <span>{t("radar.trendTitle")}</span>
            <strong>{trendLabels[report.trend.direction] ?? t("radar.trendQualitative")}</strong>
            <p>{report.trend.summary}</p>
          </div>
        </div>
      </section>

      <section className="app-card market-ai-summary">
        <div className="card-head"><div><span className="eyebrow">{t("radar.analysisSummaryEyebrow")}</span><h2>{t("radar.analysisSummaryTitle")}</h2></div><Activity size={18} aria-hidden="true" /></div>
        <p>{report.summary}</p>
        <small>{report.methodology}</small>
      </section>

      <details className="app-card market-radar-accordion market-country-recommendations">
        <summary><span><small>{t("radar.recommendationsEyebrow")}</small><strong>{t("radar.recommendationsTitle")}</strong></span><b>{report.recommendedCountries.length}</b></summary>
        <div className="market-radar-accordion-content">
          <p className="market-section-intro">{t("radar.recommendationsDescription")}</p>
          {report.recommendedCountries.length ? <div className="market-country-grid">
            {report.recommendedCountries.map((country, index) => <article className="market-country-card" key={country.code}>
              <div className="market-country-head">
                <div><span className="market-country-rank">{index + 1}</span><h3>{country.name}</h3></div>
                <strong>{country.score}/100<small>{t("radar.indicativeScore")}</small></strong>
              </div>
              <span className={`market-country-status ${country.signalStatus === "crossed" ? "is-measured" : "is-hypothesis"}`}>
                {country.signalStatus === "crossed" ? t("radar.signalCrossed") : t("radar.qualitativeHypothesis")}
              </span>
              <p className="market-country-trend"><strong>{trendLabels[country.trendDirection] ?? t("radar.trendQualitative")}:</strong> {country.trendSummary}</p>
              <p>{country.rationale}</p>
              <small className="market-country-test"><strong>{t("radar.firstTest")}:</strong> {country.firstTest}</small>
            </article>)}
          </div> : <div className="market-radar-no-recommendations">{t("radar.noRecommendations")}</div>}
        </div>
      </details>

      <details className="app-card market-radar-accordion">
        <summary><span><small>{t("radar.audienceEyebrow")}</small><strong>{t("radar.audienceTimingTitle")}</strong></span><UsersRound size={19} aria-hidden="true" /></summary>
        <div className="market-radar-accordion-content">
          <section className="market-evidence-grid">
            <div className="market-audience-card">
              <div className="card-head"><div><span className="eyebrow">{t("radar.audienceEyebrow")}</span><h2>{t("radar.audienceTitle")}</h2></div><UsersRound size={18} aria-hidden="true" /></div>
              <h3>{report.targetAudience.profile}</h3>
              <p>{report.targetAudience.rationale}</p>
              <div className="market-meta-interests">
                <strong>{t("radar.metaInterestsTitle")}</strong>
                {report.targetAudience.metaInterests.length ? <div>{report.targetAudience.metaInterests.map((interest) => <span key={interest.id} title={`Meta ID ${interest.id}`}>{interest.name}</span>)}</div> : null}
                {metaInterestMessage ? <small>{metaInterestMessage}</small> : null}
              </div>
            </div>
            <div className="market-timing-card">
              <div className="card-head"><div><span className="eyebrow">{t("radar.timingEyebrow")}</span><h2>{t("radar.timingTitle")}</h2></div><CalendarDays size={18} aria-hidden="true" /></div>
              <div className="market-campaign-days">{report.campaignTiming.days.map((day) => <span key={day}>{dayLabels[day] ?? day}</span>)}</div>
              <p>{report.campaignTiming.rationale}</p>
              <small>{t("radar.timingHypothesis")}</small>
            </div>
          </section>
        </div>
      </details>

      <details className="app-card market-radar-accordion">
        <summary><span><small>{t("radar.evidenceEyebrow")}</small><strong>{t("radar.evidenceTitle")}</strong></span><ShieldAlert size={19} aria-hidden="true" /></summary>
        <div className="market-radar-accordion-content">
          <section className="market-evidence-grid">
            <div>
              <div className="card-head"><div><span className="eyebrow">{t("radar.evidenceEyebrow")}</span><h2>{t("radar.evidenceTitle")}</h2></div><Activity size={18} aria-hidden="true" /></div>
              {report.evidence.map((item) => <div className="market-evidence" key={`${item.label}-${item.value}`}><small>{item.label}</small><strong>{item.value}</strong></div>)}
            </div>
            <div>
              <div className="card-head"><div><span className="eyebrow">{t("radar.risksEyebrow")}</span><h2>{t("radar.risksTitle")}</h2></div><ShieldAlert size={18} aria-hidden="true" /></div>
              {report.risks.map((risk, index) => <p className="market-risk" key={`${index}-${risk}`}>{risk}</p>)}
            </div>
          </section>
        </div>
      </details>

      {report.ideas.length ? <details className="app-card market-radar-accordion market-ideas">
        <summary><span><small>{t("radar.ideaConceptEyebrow")}</small><strong>{t("radar.ideaConceptTitle")}</strong></span><Lightbulb size={19} aria-hidden="true" /></summary>
        <div className="market-radar-accordion-content">
          {report.ideas.map((item) => <article className="market-idea" key={item.title}>
            <div>
              <h3>{item.title}</h3><p>{item.promise}</p><small>{t("radar.conceptAudience")}: {item.audience}</small>
              {item.outline.length ? <ul>{item.outline.map((step) => <li key={step}>{step}</li>)}</ul> : null}
              <small>{t("radar.conceptUpsell")}: {item.upsell}</small>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => onGoToAI(t("dynamicExtra.expandIdea", { title: item.title, countries: targetCountries }))}>{t("radar.developIdea")}</button>
          </article>)}
        </div>
      </details> : null}
    </> : null}
  </div>;
}
