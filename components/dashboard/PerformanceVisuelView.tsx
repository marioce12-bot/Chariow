"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, ImageIcon, Layers3, Link2, RefreshCw, ShieldCheck, Sparkles, Video } from "lucide-react";
import type { CreativePerformanceStudioPrefill } from "@/lib/creative-performance/client";
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
type Campaign = {
  campaignId: string; name: string; platform: string; status: string; productId: string | null;
  productName: string | null; launched: boolean; analyzed: boolean;
  metrics: { currency: string | null; spend: number; clicks: number; impressions: number;
    attributedOrders: number | null; attributedRevenue: number | null; attributedCurrency: string | null } | null;
};
type PerformanceData = {
  period: { from: string; to: string };
  metrics: { mediaCount: number; campaigns: number; launchedCampaigns: number; unavailableCampaignMetrics: number;
    totals: Array<{ currency: string; spend: number; clicks: number; attributedOrders: number | null;
      costPerOrder: number | null; attributedRevenue: number | null; campaigns: number; complete: boolean }> };
  media: Media[]; campaigns: Campaign[];
  productEligibility: Array<{ productId: string; productName: string; launchedCampaigns: number; analyzedCampaigns: number; eligible: boolean }>;
  duplicateCandidates: Array<{ firstId: string; secondId: string; kind: string; distance: number }>;
  notices: { carousel?: string; tikTok?: string | null; pinterest?: string | null; variant?: string };
};

const kpis = [
  { label: "Dépenses publicitaires", icon: BarChart3 },
  { label: "Clics mesurés", icon: Link2 },
  { label: "Commandes attribuées", icon: Layers3 },
  { label: "Coût par commande", icon: ShieldCheck },
  { label: "Chiffre d’affaires attribué", icon: BarChart3 },
];

function money(value: number | null, currency: string | null) {
  if (value === null || !currency) return "—";
  try { return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${value.toLocaleString("fr-FR")} ${currency}`; }
}
function number(value: number | null | undefined) {
  return value === null || value === undefined ? "—" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
}
function platformName(platform: string) {
  return platform === "meta" ? "Meta" : platform === "tiktok" ? "TikTok" : platform === "pinterest" ? "Pinterest" : platform;
}
function formatPeriod(from: string, to: string) {
  return `${new Date(`${from}T00:00:00Z`).toLocaleDateString("fr-FR")} – ${new Date(`${to}T00:00:00Z`).toLocaleDateString("fr-FR")}`;
}

export function PerformanceVisuelView({ storeId, onOpenStudio }: {
  storeId: string | null; onOpenStudio: (prefill: CreativePerformanceStudioPrefill) => void;
}) {
  const [period, setPeriod] = useState("30");
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [onlyWinners, setOnlyWinners] = useState(false);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [suggestionBusy, setSuggestionBusy] = useState<string | null>(null);
  const [suggestionMessages, setSuggestionMessages] = useState<Record<string, string>>({});
  const [variantDrafts, setVariantDrafts] = useState<Record<string, string>>({});
  const [variantSaving, setVariantSaving] = useState<string | null>(null);
  const [variantMessages, setVariantMessages] = useState<Record<string, string>>({});
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!storeId) { setData(null); setLoading(false); setError(""); return () => { alive = false; }; }
    setLoading(true); setError("");
    fetch(`/api/creative-performance?store_id=${encodeURIComponent(storeId)}&days=${period}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Performance visuel est temporairement indisponible.");
        return body as PerformanceData;
      })
      .then((result) => { if (alive) setData(result); })
      .catch((loadError) => { if (alive) { setData(null); setError(loadError instanceof Error ? loadError.message : "Données indisponibles."); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [storeId, period, refreshCount]);

  const winningCampaigns = useMemo(() => new Set((data?.campaigns ?? []).filter((campaign) =>
    campaign.metrics && campaign.metrics.attributedRevenue !== null && campaign.metrics.attributedCurrency === campaign.metrics.currency && campaign.metrics.attributedRevenue > campaign.metrics.spend,
  ).map((campaign) => campaign.campaignId)), [data]);
  const winningProducts = useMemo(() => new Set((data?.campaigns ?? []).filter((campaign) => campaign.productId && winningCampaigns.has(campaign.campaignId)).map((campaign) => campaign.productId!)), [data, winningCampaigns]);
  const visibleMedia = useMemo(() => (data?.media ?? []).filter((item) =>
    (!onlyWinners || item.winner) &&
    (platformFilter === "all" || item.campaigns.some((campaign) => campaign.platform === platformFilter))),
  [data, onlyWinners, platformFilter, winningCampaigns]);
  const campaignsWithMedia = new Set((data?.media ?? []).flatMap((item) => item.campaigns.map((placement) => placement.campaignId)));
  const campaignsWithoutMedia = (data?.campaigns ?? []).filter((campaign) => !campaignsWithMedia.has(campaign.campaignId));
  const totals = data?.metrics.totals ?? [];
  const totalSpend = totals.length ? totals.map((row) => `${money(row.spend, row.currency)}${row.complete ? "" : " · partiel"}`).join(" · ") : "—";
  const totalClicks = totals.length ? number(totals.reduce((sum, row) => sum + row.clicks, 0)) : "—";
  const allOrdersKnown = totals.length > 0 && data?.metrics.unavailableCampaignMetrics === 0 && totals.every((row) => row.attributedOrders !== null);
  const totalOrders = allOrdersKnown ? number(totals.reduce((sum, row) => sum + (row.attributedOrders ?? 0), 0)) : "—";
  const costPerOrder = data?.metrics.unavailableCampaignMetrics ? "—" : totals.filter((row) => row.costPerOrder !== null).map((row) => money(row.costPerOrder, row.currency)).join(" · ") || "—";
  const totalRevenue = totals.map((row) => money(row.attributedRevenue, row.currency)).join(" · ") || "—";
  const products = data?.productEligibility ?? [];
  const platforms = [...new Set((data?.media ?? []).flatMap((item) => item.campaigns.map((campaign) => campaign.platform)))];
  const variantRows = useMemo(() => {
    const grouped = new Map<string, { productName: string; variant: string; currency: string | null; spend: number; clicks: number; orders: number; revenue: number; count: number; complete: boolean; ordersKnown: boolean; revenueKnown: boolean }>();
    for (const media of data?.media ?? []) for (const placement of media.campaigns) {
      const variant = placement.variantLabel?.trim();
      if (!variant) continue;
      const currency = placement.metrics.currency;
      const key = `${placement.productId ?? ""}:${variant}:${currency ?? "?"}`;
      const row = grouped.get(key) ?? { productName: placement.productName || "Produit", variant, currency, spend: 0, clicks: 0, orders: 0, revenue: 0, count: 0, complete: true, ordersKnown: true, revenueKnown: true };
      row.count += 1;
      if (!placement.metrics.available || !currency || placement.metrics.spend === null || placement.metrics.clicks === null) row.complete = false;
      else { row.spend += placement.metrics.spend; row.clicks += placement.metrics.clicks; }
      if (!placement.metrics.attributionReliable || placement.metrics.attributedOrders === null) row.ordersKnown = false;
      else row.orders += placement.metrics.attributedOrders;
      if (!placement.metrics.attributionReliable || placement.metrics.attributedRevenue === null || placement.metrics.attributedCurrency !== currency) row.revenueKnown = false;
      else row.revenue += placement.metrics.attributedRevenue;
      grouped.set(key, row);
    }
    return [...grouped.entries()].map(([key, row]) => ({ ...row, key })).sort((left, right) => left.productName.localeCompare(right.productName) || left.variant.localeCompare(right.variant));
  }, [data]);

  async function propose(media: Media | null, productId: string) {
    if (!storeId) return;
    const key = `${media?.id ?? "product"}:${productId}`;
    setSuggestionBusy(key); setSuggestionMessages((current) => ({ ...current, [key]: "" }));
    try {
      const response = await fetch(`/api/creative-performance/ideas?days=${period}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, productId, ...(media ? { assetId: media.id } : {}) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Impossible de vérifier les idées Studio.");
      if (!result.eligible || !Array.isArray(result.ideas) || result.ideas.length !== 3) {
        setSuggestionMessages((current) => ({ ...current, [key]: result.message || "Il faut davantage de données réelles avant de proposer des idées." }));
        return;
      }
      onOpenStudio({ storeId, source: result.source, ideas: result.ideas, capabilities: result.capabilities });
    } catch (ideaError) {
      setSuggestionMessages((current) => ({ ...current, [key]: ideaError instanceof Error ? ideaError.message : "Idées Studio indisponibles." }));
    } finally { setSuggestionBusy(null); }
  }

  async function saveVariant(placement: Placement) {
    if (variantSaving) return;
    const id = placement.id;
    setVariantSaving(id); setVariantMessages((current) => ({ ...current, [id]: "" }));
    try {
      const response = await fetch(`/api/creative-performance/placements/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantLabel: (variantDrafts[id] ?? placement.variantLabel ?? "").trim() || null }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Impossible d’enregistrer cette variante.");
      const saved = result.placement.variant_label as string | null;
      setData((current) => current ? { ...current, media: current.media.map((media) => ({ ...media, campaigns: media.campaigns.map((campaign) => campaign.id === id ? { ...campaign, variantLabel: saved } : campaign) })) } : current);
      setVariantDrafts((current) => ({ ...current, [id]: saved ?? "" }));
      setVariantMessages((current) => ({ ...current, [id]: "Variante enregistrée." }));
    } catch (saveError) {
      setVariantMessages((current) => ({ ...current, [id]: saveError instanceof Error ? saveError.message : "Échec de l’enregistrement." }));
    } finally { setVariantSaving(null); }
  }

  return (
    <div className="creative-performance">
      <header className="creative-performance-header">
        <div>
          <div className="creative-performance-breadcrumb">Espace de travail <span aria-hidden="true">›</span> Performance visuel</div>
          <h1>Performance visuel</h1>
          <p>Compare les résultats des images et vidéos de tes campagnes publicitaires. Retrouve les dépenses, clics et, quand elles peuvent être reliées, les commandes et le chiffre d’affaires.</p>
        </div>
        <label className="creative-period"><span>Période</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Période de performance">
            <option value="7">7 derniers jours</option><option value="30">30 derniers jours</option><option value="90">90 derniers jours</option>
          </select>
        </label>
      </header>

      <section className="creative-kpis" aria-label="Indicateurs réels des campagnes">
        {kpis.map(({ label, icon: Icon }, index) => {
          const values = [totalSpend, totalClicks, totalOrders, costPerOrder, totalRevenue];
          return <article className="creative-kpi" key={label}><span className="creative-kpi-icon"><Icon size={17} aria-hidden="true" /></span><div>
            <span className="creative-kpi-label">{label}</span><strong>{values[index]}</strong>
          </div></article>;
        })}
      </section>

      {variantRows.length ? <section className="creative-variant-summary" aria-label="Comparaison des variantes renseignées">
        <div><h2>Comparaison par variante</h2><p>Consulte les résultats des variantes renseignées.</p></div>
        <div className="creative-variant-table">{variantRows.map((row) => <article className="creative-variant-summary-row" key={row.key}>
          <div><strong>{row.productName}</strong><small>{row.variant} · {row.count} rattachement(s)</small></div>
          <span><small>Dépenses</small><strong>{row.complete ? money(row.spend, row.currency) : `${money(row.spend, row.currency)} · partiel`}</strong></span>
          <span><small>Clics</small><strong>{row.complete ? number(row.clicks) : "—"}</strong></span>
          <span><small>Commandes</small><strong>{row.ordersKnown && row.complete ? number(row.orders) : "—"}</strong></span>
          <span><small>Coût/commande</small><strong>{row.ordersKnown && row.complete && row.orders > 0 ? money(row.spend / row.orders, row.currency) : "—"}</strong></span>
          <span><small>CA attribué</small><strong>{row.revenueKnown && row.complete ? money(row.revenue, row.currency) : "—"}</strong></span>
        </article>)}</div>
      </section> : null}

      {error ? <div className="creative-error" role="alert">{error}</div> : null}
      {data?.notices.tikTok ? <p className="creative-notice" role="status">{data.notices.tikTok}</p> : null}
      {data?.notices.pinterest ? <p className="creative-notice" role="status">{data.notices.pinterest}</p> : null}

      <section className="creative-library" aria-labelledby="creative-library-title">
        <div className="creative-library-head">
          <div><h2 id="creative-library-title">Créations et résultats par campagne</h2>
            <p>{data ? `${data.metrics.mediaCount} média(s) · ${data.metrics.launchedCampaigns} campagne(s) lancée(s) · ${formatPeriod(data.period.from, data.period.to)}` : "Choisis une boutique pour voir les résultats de tes campagnes."}</p>
          </div>
          <button type="button" className="creative-refresh" onClick={() => setRefreshCount((current) => current + 1)} disabled={loading || !storeId} aria-label="Actualiser les performances"><RefreshCw size={15} /> Actualiser</button>
        </div>
        <div className="creative-filters">
          <label className="creative-winner-filter"><input type="checkbox" checked={onlyWinners} onChange={(event) => setOnlyWinners(event.target.checked)} /> Produits/visuels gagnants uniquement</label>
          <label className="creative-platform-filter"><span>Plateforme</span><select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}><option value="all">Toutes</option>{platforms.map((platform) => <option key={platform} value={platform}>{platformName(platform)}</option>)}</select></label>
        </div>
        {products.some((product) => product.eligible) ? <div className="creative-ready-products"><div><strong>Produits disponibles dans Studio</strong></div>
          <div className="creative-ready-product-list">{products.filter((product) => product.eligible && (!onlyWinners || winningProducts.has(product.productId))).map((product) => {
            const key = `product:${product.productId}`;
            return <div className="creative-product-action" key={product.productId}><div><span>{product.productName}{winningProducts.has(product.productId) ? <em className="creative-badge winner">Produit gagnant</em> : null}</span><small>{product.analyzedCampaigns} campagne(s) analysée(s) · {product.launchedCampaigns} lancée(s)</small></div><button type="button" className="creative-studio-link" disabled={suggestionBusy === key} onClick={() => void propose(null, product.productId)}><Sparkles size={14} /> {suggestionBusy === key ? "Vérification…" : "Proposer des créatifs"}</button>{suggestionMessages[key] ? <small role="status" className="creative-suggestion-message">{suggestionMessages[key]}</small> : null}</div>;
          })}</div>
        </div> : null}

        {loading ? <div className="creative-state" role="status">Chargement des performances…</div>
          : !storeId ? <div className="creative-state">Choisis une boutique connectée pour consulter ses performances.</div>
          : error ? <div className="creative-state">Les performances sont momentanément indisponibles. Réessaie plus tard.</div>
          : !data?.media.length ? <div className="creative-empty">
            <div className="creative-empty-icon"><ImageIcon size={22} aria-hidden="true" /></div>
            <h3>Aucune création trouvée sur cette période</h3>
            <p>Essaie une autre période ou vérifie les filtres de plateforme.</p>
          </div>
          : !visibleMedia.length ? <div className="creative-state">Aucune création ne correspond à ces filtres.</div>
          : <div className="creative-media-list">
            {visibleMedia.map((item) => {
              const productPlacements = [...new Map(item.campaigns.filter((campaign) => campaign.productId).map((campaign) => [campaign.productId!, campaign])).values()];
              return <article className="creative-media-card" key={item.id}>
                <div className="creative-media-preview">{item.kind === "image" ? <img src={item.url} alt="Création publicitaire" loading="lazy" /> : <video src={item.url} controls playsInline preload="metadata" aria-label="Création vidéo publicitaire" />}</div>
                <div className="creative-media-content">
                  <div className="creative-media-title-row"><div><strong>{item.kind === "image" ? "Image" : <><Video size={13} /> Vidéo</>}</strong></div>
                    <div className="creative-badges">{item.winner ? <span className="creative-badge winner">Gagnant</span> : null}</div>
                  </div>
                  <div className="creative-media-metrics" aria-label="Totaux pour cette création">
                    <span><small>Dépenses</small><strong>{item.spendByCurrency.length ? item.spendByCurrency.map((row) => money(row.amount, row.currency)).join(" · ") : "—"}</strong></span>
                    <span><small>Clics</small><strong>{number(item.clicks)}</strong></span>
                    <span><small>Commandes attribuées</small><strong>{number(item.attributedOrders)}</strong></span>
                    <span><small>Coût / commande</small><strong>{money(item.costPerOrder, item.currency)}</strong></span>
                    <span><small>CA attribué</small><strong>{money(item.attributedRevenue, item.attributedCurrency)}</strong></span>
                  </div>
                  <div className="creative-campaign-details">
                    <strong>Détail par campagne et plateforme</strong>
                    {item.campaigns.map((campaign) => <div className="creative-campaign-row" key={campaign.id}>
                      <div><span>{campaign.campaignName}</span><small>{platformName(campaign.platform)} · {campaign.productName || "Produit non renseigné"}{campaign.variantLabel ? ` · ${campaign.variantLabel}` : " · variante non renseignée"} · {campaign.status}</small>
                        <div className="creative-variant-editor"><input maxLength={120} value={variantDrafts[campaign.id] ?? campaign.variantLabel ?? ""} onChange={(event) => setVariantDrafts((current) => ({ ...current, [campaign.id]: event.target.value }))} placeholder="Variante (facultatif)" aria-label={`Variante pour ${campaign.campaignName}`} /><button type="button" disabled={Boolean(variantSaving)} onClick={() => void saveVariant(campaign)}>{variantSaving === campaign.id ? "Enregistrement…" : "Enregistrer"}</button>{variantMessages[campaign.id] ? <small role="status">{variantMessages[campaign.id]}</small> : null}</div>
                      </div>
                      <div><span>{campaign.metrics.available ? money(campaign.metrics.spend, campaign.metrics.currency) : "—"}</span><small>{campaign.metrics.available ? `${number(campaign.metrics.clicks)} clics` : campaign.isMultiMedia ? "métriques non ventilées" : "rapport indisponible"}</small></div>
                      <div><span>{number(campaign.metrics.attributedOrders)}</span><small>{money(campaign.metrics.attributedRevenue, campaign.metrics.attributedCurrency)} attribués</small></div>
                    </div>)}

                  </div>
                  {productPlacements.length ? <div className="creative-studio-actions"><strong>Idées Studio</strong>{productPlacements.map((campaign) => {
                    const eligibility = products.find((product) => product.productId === campaign.productId);
                    const key = `${item.id}:${campaign.productId}`;
                    const busy = suggestionBusy === key;
                    const winningCreative = item.campaigns.some((placement) => placement.productId === campaign.productId && placement.metrics.available && placement.metrics.attributionReliable && placement.metrics.attributedRevenue !== null && placement.metrics.attributedCurrency === placement.metrics.currency && placement.metrics.attributedRevenue > (placement.metrics.spend ?? Infinity));
                    return <div className="creative-product-action" key={key}>
                      <div><span>{campaign.productName || eligibility?.productName || "Produit"}</span>
                        {!eligibility?.eligible ? <small>Données insuffisantes · campagne lancée et résultats analysés requis</small> : !winningCreative ? <small>Créatif non gagnant ou non mesuré séparément · utilise l’action au niveau du produit</small> : <small>Créatif gagnant · {eligibility.analyzedCampaigns} campagne(s) analysée(s)</small>}
                      </div>
                      <button type="button" className="creative-studio-link" disabled={!eligibility?.eligible || !winningCreative || busy} onClick={() => void propose(item, campaign.productId!)}>
                        <Sparkles size={14} /> {busy ? "Vérification…" : "Proposer des créatifs"}
                      </button>
                      {suggestionMessages[key] ? <small role="status" className="creative-suggestion-message">{suggestionMessages[key]}</small> : null}
                    </div>;
                  })}</div> : null}
                </div>
              </article>;
            })}
          </div>}
      </section>
      {campaignsWithoutMedia.length ? <details className="creative-all-campaigns"><summary>Voir aussi les campagnes sans visuel ({campaignsWithoutMedia.length})</summary><div>{campaignsWithoutMedia.map((campaign) => <div className="creative-campaign-row" key={campaign.campaignId}><div><span>{campaign.name}</span><small>{platformName(campaign.platform)} · {campaign.productName || "Produit non renseigné"} · {campaign.status}</small></div><div><span>{campaign.metrics ? money(campaign.metrics.spend, campaign.metrics.currency) : "—"}</span><small>{campaign.metrics ? `${number(campaign.metrics.clicks)} clics` : "résultats indisponibles"}</small></div><div><span>{number(campaign.metrics?.attributedOrders)}</span><small>{money(campaign.metrics?.attributedRevenue ?? null, campaign.metrics?.attributedCurrency ?? null)} attribués</small></div></div>)}</div></details> : null}
    </div>
  );
}
