"use client";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  BarChart3,
  CircleDollarSign,
  ImageIcon,
  MousePointer2,
  PackageCheck,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Star,
  Video,
} from "lucide-react";
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
type DisplayRow = {
  id: string; kind: "image" | "video"; url: string | null; title: string;
  product: string; campaign: string; variant: string; platforms: string[];
  spend: string; clicks: number | null; orders: number | null; cost: string; revenue: string;
  winner: boolean;
};
function money(value: number | null, currency: string | null, locale: string) {
  if (value === null || !currency) return "—";
  if (currency === "XOF" && locale !== "en") return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value)} FCFA`;
  try { return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${value.toLocaleString(locale === "en" ? "en-US" : "fr-FR")} ${currency}`; }
}
function number(value: number | null | undefined, locale: string) {
  return value === null || value === undefined ? "—" : new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 0 }).format(value);
}
function platformName(platform: string, locale: string) {
  const names: Record<string, string> = { meta: "Meta", tiktok: "TikTok", pinterest: "Pinterest" };
  return names[platform] ?? platform;
}
function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}
function joinOr(values: string[], fallback: string) { return values.length ? values.join(" · ") : fallback; }
function formatPeriod(from: string, to: string, locale: string) {
  const language = locale === "en" ? "en-US" : "fr-FR";
  return `${new Date(`${from}T00:00:00Z`).toLocaleDateString(language)} – ${new Date(`${to}T00:00:00Z`).toLocaleDateString(language)}`;
}
function summarizeMedia(item: Media, locale: string): DisplayRow {
  const placements = item.campaigns ?? [];
  const platforms = uniqueValues(placements.map((placement) => placement.platform));
  const spends = item.spendByCurrency?.length
    ? item.spendByCurrency.map((row) => money(row.amount, row.currency, locale)).join(" · ") + (item.metricsComplete ? "" : ` · ${locale === "en" ? "partial" : "partiel"}`)
    : money(item.spend, item.currency, locale);
  const products = uniqueValues(placements.map((placement) => placement.productName));
  const campaigns = uniqueValues(placements.map((placement) => placement.campaignName));
  const variants = uniqueValues(placements.map((placement) => placement.variantLabel));
  return {
    id: item.id, kind: item.kind, url: item.url || null,
    title: item.kind === "video" ? (locale === "en" ? "Video ad" : "Vidéo publicitaire") : (locale === "en" ? "Image ad" : "Image publicitaire"),
    product: joinOr(products, locale === "en" ? "Product not linked" : "Produit non relié"),
    campaign: joinOr(campaigns, platforms.map((platform) => platformName(platform, locale)).join(" · ") || (locale === "en" ? "Campaign not linked" : "Campagne non reliée")),
    variant: joinOr(variants, locale === "en" ? "Variant not specified" : "Variante non renseignée"),
    platforms, spend: spends, clicks: item.clicks, orders: item.attributedOrders,
    cost: money(item.costPerOrder, item.currency, locale),
    revenue: money(item.attributedRevenue, item.attributedCurrency, locale), winner: item.winner,
  };
}
function formatTotals(totals: PerformanceData["metrics"]["totals"], field: "spend" | "costPerOrder" | "attributedRevenue", locale: string) {
  const values = totals.map((row) => ({ currency: row.currency, value: row[field] }));
  if (!values.length || values.some((row) => row.value === null)) return "—";
  return values.map((row) => money(row.value, row.currency, locale)).join(" · ");
}
function escapeCsv(value: string | number | null) {
  const text = String(value ?? "—");
  return `"${text.replaceAll('"', '""')}"`;
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
  const [resultFilter, setResultFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [refreshCount, setRefreshCount] = useState(0);
  const [suggestionBusy, setSuggestionBusy] = useState<string | null>(null);
  const [suggestionMessages, setSuggestionMessages] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    if (!storeId) { setData(null); setLoading(false); setError(""); return () => { alive = false; }; }
    setLoading(true); setError("");
    const query = new URLSearchParams({ store_id: storeId, days: period });
    if (readOnly) query.set("read_only", "1");
    fetch(`/api/creative-performance?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || (en ? "Creative results are temporarily unavailable." : "Les résultats des créations sont momentanément indisponibles."));
        return body as PerformanceData;
      })
      .then((result) => { if (alive) setData(result); })
      .catch((loadError) => { if (alive) { setData(null); setError(loadError instanceof Error ? loadError.message : (en ? "Creative results are unavailable." : "Les résultats des créations sont indisponibles.")); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [storeId, period, refreshCount, en, readOnly]);
  const liveRows = useMemo(() => (data?.media ?? []).map((item) => summarizeMedia(item, locale)), [data, locale]);
  const platforms = [...new Set((data?.media ?? []).flatMap((item) => (item.campaigns ?? []).map((placement) => placement.platform)))];
  const visibleRows = liveRows.filter((row) => (resultFilter === "all" || row.winner) && (platformFilter === "all" || row.platforms.includes(platformFilter)));
  const eligibleProducts = (data?.productEligibility ?? []).filter((product) => product.eligible);
  const firstEligibleProduct = eligibleProducts[0];
  const totals = data?.metrics?.totals ?? [];
  const totalSpend = formatTotals(totals, "spend", locale);
  const totalClicks = totals.length ? number(totals.reduce((sum, row) => sum + row.clicks, 0), locale) : "—";
  const canShowOrderTotals = totals.length > 0 && totals.every((row) => row.attributedOrders !== null) && !(data?.metrics?.unavailableCampaignMetrics ?? 0);
  const totalOrders = canShowOrderTotals ? number(totals.reduce((sum, row) => sum + (row.attributedOrders ?? 0), 0), locale) : "—";
  const totalCost = formatTotals(totals, "costPerOrder", locale);
  const totalRevenue = formatTotals(totals, "attributedRevenue", locale);
  const liveWinner = (data?.media ?? []).filter((item) => item.winner).sort((a, b) => (b.attributedRevenue ?? 0) - (a.attributedRevenue ?? 0))[0];
  const liveWarning = (data?.media ?? []).filter((item) => item.clicks !== null && item.clicks > 0 && item.attributedOrders !== null)
    .sort((a, b) => (a.attributedOrders! / Math.max(a.clicks!, 1)) - (b.attributedOrders! / Math.max(b.clicks!, 1)))[0];
  async function proposeIdeas(product: PerformanceData["productEligibility"][number]) {
    if (!storeId || !onOpenStudio || readOnly || suggestionBusy) return;
    const key = product.productId; setSuggestionBusy(key); setSuggestionMessages((current) => ({ ...current, [key]: "" }));
    try {
      const query = new URLSearchParams({ days: period });
      const response = await fetch(`/api/creative-performance/ideas?${query.toString()}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storeId, productId: product.productId }) });
      const result = await response.json().catch(() => ({})) as { eligible?: boolean; error?: string; message?: string; source?: CreativePerformanceStudioPrefill["source"]; ideas?: CreativePerformanceStudioPrefill["ideas"]; capabilities?: CreativePerformanceStudioPrefill["capabilities"] };
      if (!response.ok) throw new Error(result.error || (en ? "Studio ideas are unavailable." : "Les idées Studio sont indisponibles."));
      if (!result.eligible || !Array.isArray(result.ideas) || result.ideas.length !== 3) {
        setSuggestionMessages((current) => ({ ...current, [key]: result.message || (en ? "More measured results are needed before proposing ideas." : "Il faut davantage de résultats mesurés avant de proposer des idées.") })); return;
      }
      if (!result.source || result.source.productId !== product.productId || !result.capabilities) throw new Error(en ? "The Studio proposal could not be verified." : "La proposition Studio n’a pas pu être vérifiée.");
      onOpenStudio({ storeId, origin: "visual", source: result.source, ideas: result.ideas, capabilities: result.capabilities });
    } catch (ideaError) {
      setSuggestionMessages((current) => ({ ...current, [key]: ideaError instanceof Error ? ideaError.message : (en ? "Studio ideas are unavailable." : "Les idées Studio sont indisponibles.") }));
    } finally { setSuggestionBusy(null); }
  }
  function exportCsv() {
    const rows = [["Créatif", "Produit", "Campagne", "Variante", "Plateforme", "Dépenses", "Clics", "Commandes attribuées", "Coût / commande", "CA attribué"], ...visibleRows.map((row) => [row.title, row.product, row.campaign, row.variant, row.platforms.map((platform) => platformName(platform, locale)).join(" / "), row.spend, row.clicks ?? "—", row.orders ?? "—", row.cost, row.revenue])];
    const csv = `\uFEFF${rows.map((row) => row.map((value) => escapeCsv(value)).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "suivi-des-creations.csv"; link.click(); URL.revokeObjectURL(url);
  }
  return (
    <div className="creative-performance">
      <header className="creative-performance-header">
        <div>
          <div className="creative-performance-breadcrumb">{en ? "Ads" : "Pub"} <span aria-hidden="true">›</span> {en ? "Creative analysis" : "Analyse des créations"}</div>
          <h1>{en ? "Creative performance" : "Suivi des créations"}</h1>
          <p>{en ? "Connect each creative to its product, campaign and variant — then spot what converts." : "Reliez chaque création à son produit, sa campagne et sa variante — puis repérez ce qui convertit."}</p>
        </div>
        <div className="creative-header-tools">
          <label className="creative-period"><span>{en ? "Period" : "Période"}</span><select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label={en ? "Performance period" : "Période de performance"}>
            <option value="7">{en ? "Last 7 days" : "7 derniers jours"}</option><option value="30">{en ? "Last 30 days" : "30 derniers jours"}</option><option value="90">{en ? "Last 90 days" : "90 derniers jours"}</option>
          </select></label>
          <span className="creative-data-badge">{data ? (en ? "Measured data" : "Données mesurées") : (en ? "Real data only" : "Données réelles uniquement")}</span>
        </div>
      </header>
      {error ? <div className="creative-error" role="alert">{error}</div> : null}
      {data?.notices.tikTok ? <p className="creative-notice" role="status">{data.notices.tikTok}</p> : null}
      {data?.notices.pinterest ? <p className="creative-notice" role="status">{data.notices.pinterest}</p> : null}
      {loading ? <div className="creative-state" role="status">{en ? "Loading creative results…" : "Chargement des résultats des créations…"}</div>
        : error ? <div className="creative-state">{en ? "Try refreshing the results later." : "Réessaie d’actualiser les résultats plus tard."}</div>
          : !storeId ? <div className="creative-state">{en ? "Choose a connected store to view its creatives." : "Choisis une boutique connectée pour consulter ses créations."}</div>
            : !data?.media.length && (data?.metrics?.launchedCampaigns ?? 0) === 0 && !eligibleProducts.length ? <div className="creative-state">{en ? "No measured creatives are available yet." : "Aucune création mesurée n’est disponible pour le moment."}</div>
              : <>
                <section className="creative-kpi-grid" aria-label={en ? "Creative performance summary" : "Résumé des performances créatives"}>
                  <article className="creative-kpi-card"><span className="creative-kpi-icon"><CircleDollarSign size={20} /></span><div><small>{en ? "Ad spend" : "Dépenses publicitaires"}</small><strong>{totalSpend}</strong><span>{en ? "for the period" : "sur la période"}</span></div></article>
                  <article className="creative-kpi-card"><span className="creative-kpi-icon"><MousePointer2 size={20} /></span><div><small>{en ? "Clicks" : "Clics"}</small><strong>{totalClicks}</strong><span>{en ? "across tracked creatives" : "tous créatifs confondus"}</span></div></article>
                  <article className="creative-kpi-card"><span className="creative-kpi-icon"><ShoppingBag size={20} /></span><div><small>{en ? "Attributed orders" : "Commandes attribuées"}</small><strong>{totalOrders}</strong><span>{en ? "for the period" : "sur la période"}</span></div></article>
                  <article className="creative-kpi-card"><span className="creative-kpi-icon"><BarChart3 size={20} /></span><div><small>{en ? "Average cost / order" : "Coût / commande moyen"}</small><strong>{totalCost}</strong><span>{en ? "spend ÷ attributed orders" : "dépenses ÷ commandes attribuées"}</span></div></article>
                  <article className="creative-kpi-card"><span className="creative-kpi-icon"><PackageCheck size={20} /></span><div><small>{en ? "Attributed revenue" : "Chiffre d’affaires attribué"}</small><strong>{totalRevenue}</strong><span>{en ? "from tracked creatives" : "lié aux créatifs suivis"}</span></div></article>
                </section>
                <section className="creative-insight-grid" aria-label={en ? "Creative insights" : "À retenir"}>
                  {liveWarning ? <article className="creative-insight warning"><span className="creative-insight-icon"><AlertTriangle size={20} /></span><div><small>{en ? "OPTIMIZE · MANY CLICKS, FEW CONVERSIONS" : "À OPTIMISER · BEAUCOUP DE CLICS, PEU DE CONVERSIONS"}</small><strong>{summarizeMedia(liveWarning, locale).title}</strong><span>{number(liveWarning.clicks, locale)} {en ? "clicks" : "clics"} · {number(liveWarning.attributedOrders, locale)} {en ? "attributed orders" : "commandes attribuées"}</span></div><span className="creative-insight-chevron">›</span></article>
                    : <article className="creative-insight neutral"><span className="creative-insight-icon"><AlertTriangle size={20} /></span><div><small>{en ? "OPTIMIZATION" : "OPTIMISATION"}</small><strong>{en ? "No reliable low-conversion signal" : "Aucun signal fiable de faible conversion"}</strong><span>{en ? "More complete attribution is needed." : "Une attribution plus complète est nécessaire."}</span></div></article>}
                  {liveWinner ? <article className="creative-insight winner"><span className="creative-insight-icon"><Star size={20} /></span><div><small>{en ? "WINNING CREATIVE" : "CRÉATIF GAGNANT"}</small><strong>{summarizeMedia(liveWinner, locale).title}</strong><span>{number(liveWinner.attributedOrders, locale)} {en ? "orders" : "commandes"} · {money(liveWinner.costPerOrder, liveWinner.currency, locale)} / {en ? "order" : "commande"} · {money(liveWinner.attributedRevenue, liveWinner.attributedCurrency, locale)} {en ? "attributed" : "attribués"}</span></div><span className="creative-insight-chevron">›</span></article>
                    : <article className="creative-insight neutral"><span className="creative-insight-icon"><Star size={20} /></span><div><small>{en ? "WINNING CREATIVE" : "CRÉATIF GAGNANT"}</small><strong>{en ? "No winner identified yet" : "Aucun gagnant identifié pour le moment"}</strong><span>{en ? "Reliable attributed revenue is required." : "Un chiffre d’affaires attribué fiable est nécessaire."}</span></div></article>}
                </section>
                <section className="creative-library" aria-labelledby="creative-library-title">
                  <div className="creative-library-head">
                    <div><h2 id="creative-library-title">{en ? "Results by creative" : "Résultats par création"}</h2><p>{en ? "Each row links the creative to its product, campaign and variant." : "Chaque ligne relie le contenu diffusé à son produit, sa campagne et sa variante."}</p></div>
                    <div className="creative-table-actions">
                      {firstEligibleProduct && onOpenStudio && !readOnly ? <div className="creative-proposal-card"><button type="button" className="creative-studio-link" disabled={suggestionBusy !== null} onClick={() => void proposeIdeas(firstEligibleProduct)}>
                        {suggestionBusy === firstEligibleProduct.productId ? <RefreshCw className="creative-spin" size={15} /> : <Sparkles size={15} />}{suggestionBusy === firstEligibleProduct.productId ? (en ? "Checking…" : "Vérification…") : (en ? `3 Studio ideas · ${firstEligibleProduct.productName}` : `3 idées Studio · ${firstEligibleProduct.productName}`)}
                      </button>{suggestionMessages[firstEligibleProduct.productId] ? <small role="status">{suggestionMessages[firstEligibleProduct.productId]}</small> : null}</div> : null}
                      <label className="creative-table-filter"><span><ImageIcon size={14} />{en ? "Filter" : "Filtrer"}</span><select value={resultFilter} onChange={(event) => setResultFilter(event.target.value)} aria-label={en ? "Creative filter" : "Filtre des créations"}><option value="all">{en ? "All creatives" : "Tous les créatifs"}</option><option value="winners">{en ? "Winners only" : "Meilleurs résultats"}</option></select></label>
                      {platforms.length > 0 ? <label className="creative-platform-filter"><span>{en ? "Platform" : "Plateforme"}</span><select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}><option value="all">{en ? "All" : "Toutes"}</option>{platforms.map((platform) => <option key={platform} value={platform}>{platformName(platform, locale)}</option>)}</select></label> : null}
                      <button type="button" className="creative-export" onClick={exportCsv}><ArrowDownToLine size={15} />{en ? "Export" : "Exporter"}</button>
                      <button type="button" className="creative-refresh" onClick={() => setRefreshCount((current) => current + 1)} disabled={loading || !storeId} aria-label={en ? "Refresh creative results" : "Actualiser les résultats"}><RefreshCw size={15} />{en ? "Refresh" : "Actualiser"}</button>
                    </div>
                  </div>
                  {suggestionBusy && firstEligibleProduct ? <div className="creative-suggestion-status" role="status">{en ? "Checking measured results before preparing the Studio ideas…" : "Vérification des résultats mesurés avant de préparer les idées Studio…"}</div> : null}
                  {!visibleRows.length ? <div className="creative-empty"><div className="creative-empty-icon"><ImageIcon size={22} aria-hidden="true" /></div><h3>{liveRows.length === 0 ? (en ? "No measured creatives for this period." : "Aucune création mesurée pour cette période.") : (en ? "No creatives match the selected filters." : "Aucune création ne correspond aux filtres sélectionnés.")}</h3>{liveRows.length > 0 ? <p>{en ? "Adjust the selected filters to see other creatives." : "Modifie les filtres sélectionnés pour afficher d’autres créations."}</p> : null}</div> :
                    <div className="creative-table-scroll"><table className="creative-results-table"><thead><tr><th>{en ? "CREATIVE" : "CRÉATIF"}</th><th>{en ? "PRODUCT · CAMPAIGN · VARIANT" : "PRODUIT · CAMPAGNE · VARIANTE"}</th><th>{en ? "SPEND" : "DÉPENSES"}</th><th>{en ? "CLICKS" : "CLICS"}</th><th>{en ? "ORDERS" : "COMMANDES"}</th><th>{en ? "COST / ORDER" : "COÛT / COMMANDE"}</th><th>{en ? "ATTRIBUTED REVENUE" : "CA ATTRIBUÉ"}</th></tr></thead><tbody>{visibleRows.map((row) => <tr className="creative-media-card" key={row.id}>
                      <td><div className="creative-item"><div className="creative-media-preview">{row.url ? <img src={row.url} alt="" loading="lazy" /> : row.kind === "video" ? <Video size={17} /> : <ImageIcon size={17} />}</div><div><strong>{row.title}</strong><span className="creative-platform-tags">{row.platforms.map((platform) => <span key={platform}>{platformName(platform, locale)}</span>)}</span>{row.winner ? <span className="creative-badge winner">{en ? "Winning creative" : "Créatif gagnant"}</span> : null}</div></div></td>
                      <td><div className="creative-linkage"><strong>{row.product}</strong><span>{row.campaign}{row.platforms.length === 1 ? ` · ${platformName(row.platforms[0], locale)}` : ""}</span><small>{row.variant}</small></div></td>
                      <td className="numeric-cell">{row.spend}</td><td className="numeric-cell">{number(row.clicks, locale)}</td><td className="numeric-cell">{number(row.orders, locale)}</td><td className={`numeric-cell ${row.winner ? "positive" : ""}`}>{row.cost}</td><td className={`numeric-cell ${row.winner ? "positive" : ""}`}>{row.revenue}</td>
                    </tr>)}</tbody></table></div>}
                  <div className="creative-library-foot"><span>{en ? "Orders and revenue appear only when attribution is reliable; unknown values stay blank." : "Les commandes et le chiffre d’affaires ne s’affichent que lorsque l’attribution est fiable; les valeurs inconnues restent vides."}</span><span>{data ? `${data.metrics.mediaCount} ${en ? "tracked creatives" : "créations suivies"} · ${formatPeriod(data.period.from, data.period.to, locale)}` : ""}</span></div>
                </section>
                {data?.notices.carousel ? <p className="creative-footnote">{data.notices.carousel}</p> : null}
              </>}
    </div>
  );
}
