"use client";

import { useEffect, useMemo, useState } from "react";
import { ImageIcon, RefreshCw, Sparkles, Video } from "lucide-react";
import { type CreativePerformanceStudioPrefill } from "@/lib/creative-performance/client";
import "./performance-visuel.css";

type CreativeMetric = {
  available: boolean; scope: string; currency: string | null; spend: number | null;
  impressions: number | null; clicks: number | null; platformConversions: number | null;
  attributedOrders: number | null; attributedRevenue: number | null;
  attributedCurrency: string | null; attributionReliable: boolean;
};
type Placement = {
  id: string; campaignId: string; campaignName: string; platform: string; status: string;
  productId: string | null; productName: string | null; variantLabel: string | null;
  isMultiMedia: boolean; metrics: CreativeMetric;
};
type Media = {
  id: string; kind: "image" | "video"; url: string; sha256: string; createdAt: string;
  spend: number | null; currency: string | null; spendByCurrency: Array<{ currency: string; amount: number }>;
  clicks: number | null; attributedOrders: number | null; attributedRevenue: number | null;
  attributedCurrency: string | null; costPerOrder: number | null; winner: boolean;
  metricsComplete: boolean; campaigns: Placement[];
};
export type Campaign = {
  campaignId: string; name: string; platform: string; status: string; productId: string | null;
  productName: string | null; launched: boolean; analyzed: boolean;
  metrics: { currency: string | null; spend: number; clicks: number; impressions: number;
    attributedOrders: number | null; attributedRevenue: number | null; attributedCurrency: string | null } | null;
};
export type PerformanceData = {
  period: { from: string; to: string };
  metrics: { mediaCount: number; campaigns: number; launchedCampaigns: number; unavailableCampaignMetrics: number;
    totals: Array<{ currency: string; spend: number; clicks: number; attributedOrders: number | null;
      costPerOrder: number | null; attributedRevenue: number | null; campaigns: number; complete: boolean }> };
  media: Media[]; campaigns: Campaign[];
  productEligibility: Array<{ productId: string; productName: string; launchedCampaigns: number; analyzedCampaigns: number; eligible: boolean }>;
  duplicateCandidates: Array<{ firstId: string; secondId: string; kind: string; distance: number }>;
  notices: { carousel?: string; tikTok?: string | null; pinterest?: string | null; variant?: string };
};

function money(value: number | null, currency: string | null, locale: string) {
  if (value === null || !currency) return "—";
  try { return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${value.toLocaleString(locale === "en" ? "en-US" : "fr-FR")} ${currency}`; }
}
function number(value: number | null | undefined, locale: string) {
  return value === null || value === undefined ? "—" : new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 0 }).format(value);
}
function platformName(platform: string, locale: string) {
  if (platform === "meta") return "Meta";
  if (platform === "tiktok") return "TikTok";
  if (platform === "pinterest") return "Pinterest";
  return platform;
}
function formatPeriod(from: string, to: string, locale: string) {
  const language = locale === "en" ? "en-US" : "fr-FR";
  return `${new Date(`${from}T00:00:00Z`).toLocaleDateString(language)} – ${new Date(`${to}T00:00:00Z`).toLocaleDateString(language)}`;
}

export function PerformanceVisuelView({ storeId, locale = "fr", readOnly = false, onOpenStudio }: {
  storeId: string | null; locale?: string; readOnly?: boolean;
  onOpenStudio?: (prefill: CreativePerformanceStudioPrefill) => void;
}) {
  const en = locale === "en";
  const [period, setPeriod] = useState("30");
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [onlyWinners, setOnlyWinners] = useState(false);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [refreshCount, setRefreshCount] = useState(0);
  const [suggestionBusy, setSuggestionBusy] = useState<string | null>(null);
  const [suggestionMessages, setSuggestionMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    if (!storeId) { setData(null); setLoading(false); setError(""); return () => { alive = false; }; }
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ store_id: storeId, days: period });
    if (readOnly) query.set("read_only", "1");
    fetch(`/api/creative-performance?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || (en ? "Visual performance is temporarily unavailable." : "Performance visuel est momentanément indisponible."));
        return body as PerformanceData;
      })
      .then((result) => { if (alive) setData(result); })
      .catch((loadError) => { if (alive) { setData(null); setError(loadError instanceof Error ? loadError.message : (en ? "Visual performance is unavailable." : "Performance visuel est indisponible.")); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [storeId, period, refreshCount, en, readOnly]);

  const visibleMedia = useMemo(() => (data?.media ?? []).filter((item) =>
    (!onlyWinners || item.winner) &&
    (platformFilter === "all" || item.campaigns.some((placement) => placement.platform === platformFilter))),
  [data, onlyWinners, platformFilter]);
  const platforms = [...new Set((data?.media ?? []).flatMap((item) => item.campaigns.map((placement) => placement.platform)))];
  const eligibleProducts = (data?.productEligibility ?? []).filter((product) => product.eligible);

  async function proposeIdeas(product: PerformanceData["productEligibility"][number]) {
    if (!storeId || !onOpenStudio || readOnly || suggestionBusy) return;
    const key = product.productId;
    setSuggestionBusy(key);
    setSuggestionMessages((current) => ({ ...current, [key]: "" }));
    try {
      const query = new URLSearchParams({ days: period });
      const response = await fetch(`/api/creative-performance/ideas?${query.toString()}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, productId: product.productId }),
      });
      const result = await response.json().catch(() => ({})) as {
        eligible?: boolean; error?: string; message?: string;
        source?: CreativePerformanceStudioPrefill["source"];
        ideas?: CreativePerformanceStudioPrefill["ideas"];
        capabilities?: CreativePerformanceStudioPrefill["capabilities"];
      };
      if (!response.ok) throw new Error(result.error || (en ? "Studio ideas are unavailable." : "Les idées Studio sont indisponibles."));
      if (!result.eligible || !Array.isArray(result.ideas) || result.ideas.length !== 3) {
        setSuggestionMessages((current) => ({ ...current, [key]: result.message || (en ? "More measured results are needed before proposing ideas." : "Il faut davantage de résultats mesurés avant de proposer des idées.") }));
        return;
      }
      if (!result.source || result.source.productId !== product.productId || !result.capabilities) {
        throw new Error(en ? "The Studio proposal could not be verified." : "La proposition Studio n’a pas pu être vérifiée.");
      }
      onOpenStudio({ storeId, origin: "visual", source: result.source, ideas: result.ideas, capabilities: result.capabilities });
    } catch (ideaError) {
      setSuggestionMessages((current) => ({ ...current, [key]: ideaError instanceof Error ? ideaError.message : (en ? "Studio ideas are unavailable." : "Les idées Studio sont indisponibles.") }));
    } finally {
      setSuggestionBusy(null);
    }
  }

  return (
    <div className="creative-performance">
      <header className="creative-performance-header">
        <div>
          <div className="creative-performance-breadcrumb">{en ? "Workspace" : "Espace de travail"} <span aria-hidden="true">›</span> {en ? "Creative performance" : "Performance visuel"}</div>
          <h1>{en ? "Creatives" : "Créations"}</h1>
          <p>{en ? "Compare the measured results of your images and videos." : "Compare les résultats mesurés de tes images et vidéos."}</p>
        </div>
        <label className="creative-period"><span>{en ? "Period" : "Période"}</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label={en ? "Performance period" : "Période de performance"}>
            <option value="7">{en ? "Last 7 days" : "7 derniers jours"}</option>
            <option value="30">{en ? "Last 30 days" : "30 derniers jours"}</option>
            <option value="90">{en ? "Last 90 days" : "90 derniers jours"}</option>
          </select>
        </label>
      </header>

      {error ? <div className="creative-error" role="alert">{error}</div> : null}
      {data?.notices.tikTok ? <p className="creative-notice" role="status">{data.notices.tikTok}</p> : null}
      {data?.notices.pinterest ? <p className="creative-notice" role="status">{data.notices.pinterest}</p> : null}

      {data && !readOnly && onOpenStudio ? <section className="creative-proposals" aria-labelledby="creative-proposals-title">
        <div className="creative-proposals-head">
          <div><span className="eyebrow">Studio</span>
            <h2 id="creative-proposals-title">{en ? "Propose three creative variations" : "Proposer 3 variantes visuelles"}</h2>
            <p>{en ? "Studio will suggest three ideas based on measured results. Nothing is generated until you choose an idea in Studio." : "Studio proposera trois idées à partir de résultats mesurés. Rien ne sera généré avant que tu choisisses une idée dans Studio."}</p>
          </div>
        </div>
        {eligibleProducts.length ? <div className="creative-proposal-list">
          {eligibleProducts.map((product) => <article className="creative-proposal-card" key={product.productId}>
            <div><strong>{product.productName}</strong><small>{en ? "Ideas are hypotheses, not a promise of results." : "Des pistes fondées sur les mesures disponibles, sans promesse de résultat."}</small></div>
            <button type="button" className="creative-studio-link" disabled={suggestionBusy !== null} onClick={() => void proposeIdeas(product)}>
              {suggestionBusy === product.productId ? <RefreshCw className="creative-spin" size={15} /> : <Sparkles size={15} />}
              {suggestionBusy === product.productId ? (en ? "Checking…" : "Vérification…") : (en ? "Propose 3 variations" : "Proposer 3 variantes")}
            </button>
            {suggestionMessages[product.productId] ? <small className="creative-suggestion-message" role="status">{suggestionMessages[product.productId]}</small> : null}
          </article>)}
        </div> : <p className="creative-proposals-empty" role="note">{en
          ? "Studio ideas become available when a product has a genuinely launched campaign with measured results."
          : "Les idées Studio seront disponibles lorsqu’un produit aura une campagne réellement lancée avec des résultats mesurés."}</p>}
      </section> : null}

      <section className="creative-library" aria-labelledby="creative-library-title">
        <div className="creative-library-head">
          <div>
            <h2 id="creative-library-title">{en ? "Compare visuals" : "Comparer les visuels"}</h2>
            <p>{data ? `${data.metrics.mediaCount} ${en ? "visual(s)" : "visuel(s)"} · ${formatPeriod(data.period.from, data.period.to, locale)}` : (en ? "Choose a connected store to view its visuals." : "Choisis une boutique connectée pour consulter ses visuels.")}</p>
          </div>
          <button type="button" className="creative-refresh" onClick={() => setRefreshCount((current) => current + 1)} disabled={loading || !storeId} aria-label={en ? "Refresh visual performance" : "Actualiser les performances visuelles"}>
            <RefreshCw size={15} /> {en ? "Refresh" : "Actualiser"}
          </button>
        </div>
        <div className="creative-filters">
          <label className="creative-winner-filter"><input type="checkbox" checked={onlyWinners} onChange={(event) => setOnlyWinners(event.target.checked)} /> {en ? "Winning visuals only" : "Visuels gagnants uniquement"}</label>
          <label className="creative-platform-filter"><span>{en ? "Platform" : "Plateforme"}</span>
            <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
              <option value="all">{en ? "All" : "Toutes"}</option>
              {platforms.map((platform) => <option key={platform} value={platform}>{platformName(platform, locale)}</option>)}
            </select>
          </label>
        </div>

        {loading ? <div className="creative-state" role="status">{en ? "Loading visual results…" : "Chargement des résultats visuels…"}</div>
          : !storeId ? <div className="creative-state">{en ? "Choose a connected store to view its visuals." : "Choisis une boutique connectée pour consulter ses visuels."}</div>
            : error ? <div className="creative-state">{en ? "Try refreshing the results later." : "Réessaie d’actualiser les résultats plus tard."}</div>
              : !data?.media.length ? <div className="creative-empty">
                <div className="creative-empty-icon"><ImageIcon size={22} aria-hidden="true" /></div>
                <h3>{en ? "No visuals to compare yet" : "Aucun visuel à comparer pour le moment"}</h3>
                <p>{en ? "When ad visuals have measurable results, they will appear here." : "Les visuels publicitaires avec des résultats mesurables apparaîtront ici."}</p>
              </div>
                : !visibleMedia.length ? <div className="creative-state">{en ? "No visuals match these filters." : "Aucun visuel ne correspond à ces filtres."}</div>
                  : <div className="creative-media-list">
                    {visibleMedia.map((item) => {
                      const placementPlatforms = [...new Set(item.campaigns.map((placement) => placement.platform))].map((platform) => platformName(platform, locale)).join(" · ");
                      return <article className="creative-media-card" key={item.id}>
                        <div className="creative-media-preview">
                          {item.kind === "image"
                            ? <img src={item.url} alt={en ? "Advertising visual" : "Visuel publicitaire"} loading="lazy" />
                            : <video src={item.url} controls playsInline preload="metadata" aria-label={en ? "Advertising video" : "Vidéo publicitaire"} />}
                        </div>
                        <div className="creative-media-content">
                          <div className="creative-media-title-row">
                            <div><strong>{item.kind === "image" ? (en ? "Image" : "Image") : <><Video size={13} /> {en ? "Video" : "Vidéo"}</>}</strong>
                              {placementPlatforms ? <small>{placementPlatforms}</small> : null}</div>
                            <div className="creative-badges">{item.winner ? <span className="creative-badge winner">{en ? "Top result" : "Meilleur résultat"}</span> : null}</div>
                          </div>
                          <div className="creative-media-metrics" aria-label={en ? "Results for this visual" : "Résultats pour ce visuel"}>
                            <span><small>{en ? "Spend" : "Dépenses"}</small><strong>{item.spendByCurrency.length ? `${item.spendByCurrency.map((row) => money(row.amount, row.currency, locale)).join(" · ")}${item.metricsComplete ? "" : ` · ${en ? "partial" : "partiel"}`}` : "—"}</strong></span>
                            <span><small>{en ? "Clicks" : "Clics"}</small><strong>{number(item.clicks, locale)}</strong></span>
                            <span><small>{en ? "Attributed orders" : "Commandes attribuées"}</small><strong>{number(item.attributedOrders, locale)}</strong></span>
                            <span><small>{en ? "Cost / order" : "Coût / commande"}</small><strong>{money(item.costPerOrder, item.currency, locale)}</strong></span>
                            <span><small>{en ? "Attributed revenue" : "CA attribué"}</small><strong>{money(item.attributedRevenue, item.attributedCurrency, locale)}</strong></span>
                          </div>
                        </div>
                      </article>;
                    })}
                  </div>}
        <div className="creative-library-foot">{en
          ? "Orders and revenue appear only when attribution is available; unknown values stay blank."
          : "Les commandes et le chiffre d’affaires s’affichent seulement si l’attribution est disponible; les valeurs inconnues restent vides."}</div>
      </section>
    </div>
  );
}
