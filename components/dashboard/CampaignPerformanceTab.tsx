"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Globe2, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { imageCreditCost } from "@/lib/studio/credits";
import { uploadCampaignMedia } from "@/lib/media/direct-upload";
import type { GeographyAnalytics } from "@/lib/chariow/geography";
import type { ProductData } from "./shared";
import type { EditableCampaign } from "../vendeo/wizard/types";
import type { Campaign, PerformanceData } from "./PerformanceVisuelView";

type CampaignRecord = EditableCampaign & { status?: string | null; external_campaign_id?: string | null };
type Recommendation = { campaign: Campaign; config: CampaignRecord; roas: number };
type PendingImage = { productId: string; campaignId: string; product: ProductData | null; imageUrl: string; idea: unknown };

function formatNumber(value: number | null | undefined, locale: string) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 2 }).format(value);
}
function formatMoney(value: number | null | undefined, currency: string | null | undefined, locale: string) {
  if (value === null || value === undefined || !currency) return "—";
  try { return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${formatNumber(value, locale)} ${currency}`; }
}
function networkName(platform: string, locale: string) {
  return platform === "meta" ? "Meta" : platform === "tiktok" ? "TikTok" : platform === "pinterest" ? "Pinterest" : platform;
}
function periodLabel(period: { from: string; to: string } | null, locale: string) {
  if (!period) return "";
  const language = locale === "en" ? "en-US" : "fr-FR";
  return `${new Date(`${period.from}T00:00:00Z`).toLocaleDateString(language)} – ${new Date(`${period.to}T00:00:00Z`).toLocaleDateString(language)}`;
}
function cleanName(value: string) {
  return value.normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 52) || "vendeo-image";
}

export function CampaignPerformanceTab({
  storeId, period, periodDays, data, loading, products, readOnly, onApplyCampaign, locale = "fr",
}: {
  storeId: string | null;
  period: PerformanceData["period"] | null;
  periodDays: string;
  data: PerformanceData | null;
  loading: boolean;
  products: ProductData[];
  readOnly: boolean;
  onApplyCampaign: (campaign: EditableCampaign) => void;
  locale?: string;
}) {
  const en = locale === "en";
  const generationCost = imageCreditCost("hd", "medium");
  const [campaignRecords, setCampaignRecords] = useState<CampaignRecord[]>([]);
  const [campaignsError, setCampaignsError] = useState("");
  const [geo, setGeo] = useState<GeographyAnalytics | null>(null);
  const [geoError, setGeoError] = useState("");
  const [geoLoading, setGeoLoading] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [actionMessages, setActionMessages] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    setCampaignRecords([]);
    setCampaignsError("");
    if (!storeId) return () => { alive = false; };
    const query = new URLSearchParams({ store_id: storeId });
    fetch(`/api/ad-campaigns?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || (en ? "Campaign configurations are unavailable." : "Les configurations de campagne sont indisponibles."));
        return Array.isArray(body.campaigns) ? body.campaigns as CampaignRecord[] : [];
      })
      .then((rows) => { if (alive) setCampaignRecords(rows); })
      .catch((error) => { if (alive) setCampaignsError(error instanceof Error ? error.message : (en ? "Campaign configurations are unavailable." : "Les configurations de campagne sont indisponibles.")); });
    return () => { alive = false; };
  }, [storeId, en]);

  useEffect(() => {
    let alive = true;
    setGeo(null);
    setGeoError("");
    if (!storeId || !period) { setGeoLoading(false); return () => { alive = false; }; }
    const query = new URLSearchParams({ store_id: storeId, from: period.from, to: period.to });
    setGeoLoading(true);
    fetch(`/api/ad-performance/geography?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || (en ? "Chariow geography data is unavailable." : "Les données géographiques Chariow sont indisponibles."));
        return body as GeographyAnalytics;
      })
      .then((result) => { if (alive) setGeo(result); })
      .catch((error) => { if (alive) setGeoError(error instanceof Error ? error.message : (en ? "Chariow geography data is unavailable." : "Les données géographiques Chariow sont indisponibles.")); })
      .finally(() => { if (alive) setGeoLoading(false); });
    return () => { alive = false; };
  }, [storeId, period?.from, period?.to, en]);

  const recordsById = useMemo(() => new Map(campaignRecords.map((campaign) => [campaign.id, campaign])), [campaignRecords]);
  const recommendations = useMemo(() => {
    const result = new Map<string, Recommendation>();
    for (const product of data?.productEligibility ?? []) {
      if (!product.eligible) continue;
      const candidates = (data?.campaigns ?? []).flatMap((campaign) => {
        const metrics = campaign.metrics;
        if (campaign.productId !== product.productId || !campaign.launched || !campaign.analyzed || !metrics ||
            !metrics.currency || !metrics.attributedCurrency || metrics.currency !== metrics.attributedCurrency ||
            metrics.attributedOrders === null || metrics.attributedOrders <= 0 || metrics.attributedRevenue === null ||
            metrics.spend <= 0 || metrics.attributedRevenue <= metrics.spend) return [];
        const config = recordsById.get(campaign.campaignId);
        return config ? [{ campaign, config, roas: metrics.attributedRevenue / metrics.spend }] : [];
      }).sort((left, right) => right.roas - left.roas);
      if (candidates[0]) result.set(product.productId, candidates[0]);
    }
    return result;
  }, [data, recordsById]);

  async function importGeneratedImage(pending: PendingImage) {
    const key = pending.productId;
    setBusyProductId(key);
    setActionMessages((current) => ({ ...current, [key]: "" }));
    try {
      const imageResponse = await fetch(pending.imageUrl, { cache: "no-store" });
      if (!imageResponse.ok) throw new Error(en ? "The generated image could not be retrieved from Studio." : "L’image générée ne peut pas être récupérée depuis Studio.");
      const blob = await imageResponse.blob();
      if (blob.type && !blob.type.startsWith("image/")) throw new Error(en ? "Studio did not return a usable image." : "Studio n’a pas renvoyé une image exploitable.");
      const mimeType = blob.type || "image/png";
      const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
      const file = new File([blob], `${cleanName(products.find((product) => product.id === key)?.name ?? "vendeo-image")}.${extension}`, { type: mimeType });
      const uploaded = await uploadCampaignMedia(file);
      if (typeof uploaded.secure_url !== "string" || !uploaded.secure_url.startsWith("https://")) throw new Error(en ? "The image was not verified for campaign use." : "Le visuel n’a pas été validé pour une campagne.");
      const recommendation = recommendations.get(key);
      if (!recommendation || recommendation.campaign.campaignId !== pending.campaignId) throw new Error(en ? "The measured reference campaign is no longer available. Refresh the report." : "La campagne de référence mesurée n’est plus disponible. Actualise les résultats.");
      const source = recommendation.config;
      onApplyCampaign({ ...source, media_url: uploaded.secure_url, carousel_urls: [], product_id: key, product_name: products.find((product) => product.id === key)?.name ?? source.product_name });
      setPendingImage(null);
    } catch (error) {
      setActionMessages((current) => ({ ...current, [key]: error instanceof Error ? error.message : (en ? "The generated image could not be prepared." : "Le visuel généré n’a pas pu être préparé." ) }));
    } finally {
      setBusyProductId(null);
    }
  }

  async function applyRecommendation(productId: string) {
    if (readOnly || !storeId || busyProductId) return;
    const recommendation = recommendations.get(productId);
    if (!recommendation) return;
    const product = products.find((row) => row.id === productId) ?? null;
    const productLite = {
      id: productId,
      name: product?.name ?? recommendation.campaign.productName ?? productId,
      description: product?.description ?? null,
      price: product?.price ?? null,
      currency: product?.currency ?? null,
      image: product?.image ?? null,
    };
    setBusyProductId(productId);
    setActionMessages((current) => ({ ...current, [productId]: "" }));
    try {
      const ideasResponse = await fetch(`/api/creative-performance/ideas?days=${encodeURIComponent(periodDays)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, productId }),
      });
      const ideasBody = await ideasResponse.json().catch(() => ({}));
      if (!ideasResponse.ok || !ideasBody.eligible || !Array.isArray(ideasBody.ideas)) {
        throw new Error(ideasBody.message || ideasBody.error || (en ? "There is not enough verified data to prepare this campaign." : "Les données vérifiées ne suffisent pas pour préparer cette campagne."));
      }
      const idea = ideasBody.ideas.find((item: any) => item?.format === "image");
      if (!idea || !ideasBody.source) throw new Error(en ? "No image idea is available for this product." : "Aucune idée au format image n’est disponible pour ce produit.");
      const imageResponse = await fetch("/api/studio/image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: idea.prompt,
          quality: "medium",
          resolution: "hd",
          orientation: "square",
          outputFormat: "png",
          ...(productLite.image && productLite.image.startsWith("https://") ? { referenceUrls: [productLite.image] } : {}),
          product: productLite,
          creativePerformanceSource: ideasBody.source,
          creativeIdea: idea,
        }),
      });
      const imageBody = await imageResponse.json().catch(() => ({}));
      if (!imageResponse.ok || typeof imageBody.imageUrl !== "string") {
        const error = imageBody.error || (en ? "Image generation could not be confirmed." : "La génération de l’image n’a pas pu être confirmée.");
        throw new Error(`${error} ${en ? "Check Studio history before trying again." : "Vérifie l’historique Studio avant de réessayer."}`);
      }
      const pending = { productId, campaignId: recommendation.campaign.campaignId, product, imageUrl: imageBody.imageUrl, idea };
      setPendingImage(pending);
      await importGeneratedImage(pending);
    } catch (error) {
      setActionMessages((current) => ({ ...current, [productId]: error instanceof Error ? error.message : (en ? "Unable to prepare the campaign." : "Impossible de préparer la campagne.") }));
    } finally {
      setBusyProductId(null);
    }
  }

  const campaigns = data?.campaigns ?? [];
  const eligibleProducts = data?.productEligibility ?? [];
  const visits = geo ? geo.visitsByLocation : null;
  const sales = geo ? geo.salesByCountry : null;
  const conversions = geo ? geo.conversionByCountry : null;

  return <div className="creative-campaign-tab">
    <section className="creative-library creative-campaigns-table" aria-labelledby="campaign-performance-title">
      <div className="creative-library-head">
        <div><h2 id="campaign-performance-title">{en ? "Campaign results" : "Résultats des campagnes"}</h2>
          <p>{data ? `${campaigns.length} ${en ? "campaign(s)" : "campagne(s)"} · ${periodLabel(data.period, locale)}` : (en ? "Platform results and Chariow attribution for the selected store." : "Résultats des plateformes et attribution Chariow pour la boutique sélectionnée.")}</p>
        </div>
      </div>
      {loading ? <div className="creative-state" role="status">{en ? "Loading campaign performance…" : "Chargement des performances de campagne…"}</div>
        : !storeId ? <div className="creative-state">{en ? "Choose a connected store to view campaign performance." : "Choisis une boutique connectée pour consulter les performances des campagnes."}</div>
        : !campaigns.length ? <div className="creative-empty"><div className="creative-empty-icon"><BarChart3 size={22} /></div><h3>{en ? "No campaigns in this period" : "Aucune campagne sur cette période"}</h3><p>{en ? "Launch campaigns and connect their results before comparing them here." : "Lance des campagnes et connecte leurs résultats pour les comparer ici."}</p></div>
        : <div className="creative-table-scroll"><table className="creative-campaign-table"><thead><tr>
          <th>{en ? "Campaign" : "Campagne"}</th><th>{en ? "Spend" : "Dépenses"}</th><th>{en ? "Clicks" : "Clics"}</th><th>{en ? "Attributed orders" : "Commandes attribuées"}</th><th>{en ? "Attributed revenue" : "CA attribué"}</th><th>ROAS</th>
        </tr></thead><tbody>{campaigns.map((campaign) => {
          const metric = campaign.metrics;
          const sameCurrency = Boolean(metric?.currency && metric.attributedCurrency === metric.currency);
          const roas = metric && metric.spend > 0 && metric.attributedRevenue !== null && sameCurrency ? metric.attributedRevenue / metric.spend : null;
          return <tr key={campaign.campaignId}>
            <td><strong>{campaign.name}</strong><small>{networkName(campaign.platform, locale)} · {campaign.status}{!campaign.analyzed ? (en ? " · metrics unavailable" : " · mesures indisponibles") : ""}</small></td>
            <td>{metric?.currency ? formatMoney(metric.spend, metric.currency, locale) : "—"}</td>
            <td>{metric ? formatNumber(metric.clicks, locale) : "—"}</td>
            <td>{metric ? formatNumber(metric.attributedOrders, locale) : "—"}</td>
            <td>{metric ? formatMoney(metric.attributedRevenue, metric.attributedCurrency, locale) : "—"}</td>
            <td>{roas === null ? "—" : `${formatNumber(roas, locale)}×`}</td>
          </tr>;
        })}</tbody></table></div>}
      {campaignsError ? <p className="creative-notice" role="status">{campaignsError}</p> : null}
      <div className="creative-library-foot">{en
        ? "Attributed orders/revenue are shown only when the platform and Chariow link can be verified; unknown values are left blank. ROAS is hidden when currencies differ."
        : "Commandes et chiffre d’affaires attribués ne s’affichent que lorsque le lien plateforme–Chariow est vérifiable ; les valeurs inconnues restent vides. Le ROAS est masqué si les devises diffèrent."}</div>
    </section>

    <section className="creative-library creative-geography-card" aria-labelledby="geography-title">
      <div className="creative-library-head">
        <div><h2 id="geography-title"><Globe2 size={16} aria-hidden="true" /> {en ? "Chariow visits, sales and conversions" : "Visites, ventes et conversions Chariow"}</h2>
          <p>{en ? "Traffic locations are separate from the country dimensions returned for sales and conversions; none is an ad audience setting." : "Les lieux de trafic sont distincts des dimensions pays renvoyées pour les ventes et conversions ; aucune n’est un réglage d’audience publicitaire."}</p>
        </div>
      </div>
      {geoLoading ? <div className="creative-state" role="status">{en ? "Loading Chariow analytics…" : "Chargement des analytics Chariow…"}</div>
        : geoError ? <div className="creative-notice" role="status">{geoError}</div>
        : !geo ? <div className="creative-state">{en ? "Select a period to load Chariow geography." : "Sélectionne une période pour charger les données géographiques Chariow."}</div>
        : <div className="creative-geography-grid">
          <GeoTable locale={locale} title={en ? "Visits by location" : "Visites par lieu"} emptyLabel={en ? "Chariow did not return usable location breakdowns for this period." : "Chariow n’a pas renvoyé de ventilation des visites par lieu exploitable sur cette période."} headers={[en ? "Location" : "Lieu", en ? "Visits" : "Visites"]} rows={visits === null ? null : visits.map((row) => [row.location || "—", formatNumber(row.visits, locale)])} />
          <GeoTable locale={locale} title={en ? "Sales by Chariow country field" : "Ventes par champ pays Chariow"} emptyLabel={en ? "Chariow did not return a usable sales breakdown by country for this period." : "Chariow n’a pas renvoyé de ventilation des ventes par pays exploitable sur cette période."} headers={[en ? "Country" : "Pays", en ? "Sales" : "Ventes", en ? "Revenue" : "Chiffre d’affaires"]} rows={sales === null ? null : sales.map((row) => [row.country || "—", formatNumber(row.sales, locale), formatMoney(row.revenue, row.currency, locale)])} />
          <GeoTable locale={locale} title={en ? "Conversions by Chariow country field" : "Conversions par champ pays Chariow"} emptyLabel={en ? "Chariow did not return usable conversion rates by country for this period." : "Chariow n’a pas renvoyé de taux de conversion par pays exploitable sur cette période."} headers={[en ? "Country" : "Pays", en ? "Visits" : "Visites", en ? "Sales" : "Ventes", en ? "Reported value" : "Valeur rapportée"]} rows={conversions === null ? null : conversions.map((row) => [row.country || "—", formatNumber(row.visits, locale), formatNumber(row.sales, locale), formatNumber(row.rate, locale)])} />
        </div>}
      <div className="creative-library-foot">{en
        ? "Chariow documents traffic locations separately from sales/conversion by_country, but does not publish the exact result schema or define what the sales country represents. Values are shown as returned; missing breakdowns are never inferred from phone, shipping or billing data."
        : "Chariow document séparément les lieux de trafic et les dimensions ventes/conversions by_country, mais ne publie pas le schéma détaillé des résultats ni la définition du pays de vente. Les valeurs sont affichées telles que renvoyées ; aucune ventilation manquante n’est déduite du téléphone, de l’expédition ou de la facturation."}</div>
    </section>

    <section className="creative-library creative-recommendation-card" aria-labelledby="campaign-recommendations-title">
      <div className="creative-library-head">
        <div><h2 id="campaign-recommendations-title"><Sparkles size={16} aria-hidden="true" /> {en ? "Prepare a campaign from measured results" : "Préparer une campagne à partir des résultats mesurés"}</h2>
          <p>{en ? "A reference is selected only when attributed purchases, revenue and spend are reliable and in the same currency. It is a historical reference, not a promise." : "Une référence n’est retenue que si achats attribués, chiffre d’affaires et dépenses sont fiables et dans la même devise. C’est un repère historique, pas une promesse."}</p>
        </div>
      </div>
      {eligibleProducts.length ? <div className="creative-recommendation-list">{eligibleProducts.map((product) => {
        const reference = recommendations.get(product.productId);
        const busy = busyProductId === product.productId;
        const pending = pendingImage?.productId === product.productId;
        return <article className="creative-recommendation-row" key={product.productId}>
          <div className="creative-recommendation-copy">
            <strong>{product.productName}</strong>
            {reference ? <small>{en ? "Measured reference" : "Campagne de référence mesurée"} : {reference.campaign.name} · {networkName(reference.campaign.platform, locale)} · {formatNumber(reference.campaign.metrics?.attributedOrders, locale)} {en ? "attributed orders" : "commandes attribuées"} · ROAS {formatNumber(reference.roas, locale)}×</small>
              : <small>{en ? "No profitable reference with reliable attributed purchases, matching currencies and measurable spend." : "Aucune référence rentable avec achats attribués fiables, devises concordantes et dépenses mesurées."}</small>}
            {reference ? <small>{en ? "When applied, the historic copy, platform, audience and budget are copied as editable starting values. The countries are past targeting choices—not proven buyer countries." : "En appliquant, le texte, la plateforme, l’audience et le budget historiques sont repris comme valeurs de départ modifiables. Les pays sont un ancien ciblage, pas les pays prouvés des acheteurs."}</small> : null}
            {actionMessages[product.productId] ? <small role="alert" className="creative-suggestion-message">{actionMessages[product.productId]}</small> : null}
            {pending && !busy ? <small role="status">{en ? "Image generated and saved in Studio. You can retry the campaign-media upload without generating another image." : "Image générée et conservée dans Studio. Tu peux réessayer l’import du média sans générer une nouvelle image."}</small> : null}
          </div>
          {pending ? <button type="button" className="creative-studio-link" disabled={busy || readOnly} onClick={() => void importGeneratedImage(pendingImage!)}><ImagePlus size={14} /> {busy ? (en ? "Preparing…" : "Préparation…") : (en ? "Retry media import" : "Réessayer l’import du média")}</button>
            : <button type="button" className="creative-studio-link" disabled={!reference || readOnly || Boolean(busyProductId)} onClick={() => void applyRecommendation(product.productId)}><ImagePlus size={14} /> {busy ? <><Loader2 size={14} className="creative-spin" /> {en ? "Generating…" : "Génération…"}</> : (en ? `Apply · ${generationCost} credits` : `Appliquer · ${generationCost} crédits`)}</button>}
          {!reference ? <span className="creative-recommendation-hint">{en ? "Clicks alone are not enough to choose a winning campaign." : "Les clics seuls ne suffisent pas pour choisir une campagne gagnante."}</span> : <span className="creative-recommendation-hint">{en ? `Applying generates one HD image for ${generationCost} Studio credits, then opens the editable campaign draft. Video is not generated in this flow.` : `Appliquer génère d’abord une image HD pour ${generationCost} crédits Studio, puis ouvre le brouillon modifiable. Aucune vidéo n’est générée dans ce parcours.`}</span>}
        </article>;
      })}</div> : <div className="creative-state">{en ? "A product needs at least one launched, measured campaign before recommendations are available." : "Un produit doit avoir au moins une campagne lancée et mesurée avant de recevoir des recommandations."}</div>}
    </section>
  </div>;
}

function GeoTable({ title, headers, rows, emptyLabel, locale }: { title: string; headers: string[]; rows: string[][] | null; emptyLabel: string; locale: string }) {
  const en = locale === "en";
  return <article className="creative-geo-table">
    <h3>{title}</h3>
    {rows === null ? <p className="creative-geo-empty">{emptyLabel}</p> : rows.length === 0 ? <p className="creative-geo-empty">{en ? "No rows were returned." : "Aucune ligne n’a été renvoyée."}</p> : <div className="creative-table-scroll"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell}</td>)}</tr>)}</tbody></table></div>}
  </article>;
}
