"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, ImagePlus, Loader2, Play, Sparkles } from "lucide-react";
import { imageCreditCost } from "@/lib/studio/credits";
import { CampaignPerformanceDemo } from "./CampaignPerformanceDemo";
import { uploadCampaignMedia } from "@/lib/media/direct-upload";
import type { ProductData } from "./shared";
import type { EditableCampaign } from "../vendeo/wizard/types";
import type { Campaign, PerformanceData } from "./PerformanceVisuelView";

type CampaignRecord = EditableCampaign & { status?: string | null; external_campaign_id?: string | null };
type Recommendation = { campaign: Campaign; config: CampaignRecord };
type PendingImage = { productId: string; campaignId: string; imageUrl: string };
type ProductChoice = { id: string; name: string; description?: string | null; price?: string | number | null; currency?: string | null; image?: string | null };

function cleanName(value: string) {
  return value.normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 52) || "vendeo-image";
}

function platformLabel(platform: string, en: boolean) {
  if (platform === "meta") return "Meta Ads";
  if (platform === "tiktok") return "TikTok Ads";
  if (platform === "pinterest") return "Pinterest Ads";
  return en ? "Unavailable" : "Indisponible";
}

function formatDailyBudget(value: number | string, locale: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", {
    style: "currency", currency: "USD", maximumFractionDigits: 2,
  }).format(amount);
}

export function CampaignPerformanceTab({
  storeId,
  periodDays,
  data,
  loading,
  products,
  readOnly,
  onApplyCampaign,
  locale = "fr",
}: {
  storeId: string | null;
  periodDays: string;
  data: PerformanceData | null;
  loading: boolean;
  products: ProductData[];
  readOnly: boolean;
  onApplyCampaign: (campaign: EditableCampaign) => void;
  locale?: string;
}) {
  const en = locale === "en";
  const previewExamples = readOnly || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "preview";
  const generationCost = imageCreditCost("hd", "medium");
  const [campaignRecords, setCampaignRecords] = useState<CampaignRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(Boolean(storeId));
  const [recordsError, setRecordsError] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  useEffect(() => {
    let alive = true;
    setCampaignRecords([]);
    setRecordsError("");
    if (!storeId) {
      setRecordsLoading(false);
      return () => { alive = false; };
    }
    setRecordsLoading(true);
    const query = new URLSearchParams({ store_id: storeId });
    fetch(`/api/ad-campaigns?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Campaign configurations are unavailable.");
        return Array.isArray(body.campaigns) ? body.campaigns as CampaignRecord[] : [];
      })
      .then((rows) => { if (alive) setCampaignRecords(rows); })
      .catch((error) => { if (alive) setRecordsError(error instanceof Error ? error.message : "Campaign configurations are unavailable."); })
      .finally(() => { if (alive) setRecordsLoading(false); });
    return () => { alive = false; };
  }, [storeId]);

  const productOptions = useMemo(() => {
    const choices = new Map<string, ProductChoice>();
    for (const product of products) choices.set(product.id, product);
    for (const item of data?.productEligibility ?? []) {
      if (!choices.has(item.productId)) choices.set(item.productId, { id: item.productId, name: item.productName });
    }
    return [...choices.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [products, data?.productEligibility]);

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
        return config ? [{ campaign, config }] : [];
      }).sort((left, right) => {
        const leftMetrics = left.campaign.metrics!;
        const rightMetrics = right.campaign.metrics!;
        return (rightMetrics.attributedRevenue! / rightMetrics.spend) - (leftMetrics.attributedRevenue! / leftMetrics.spend);
      });
      if (candidates[0]) result.set(product.productId, candidates[0]);
    }
    return result;
  }, [data, recordsById]);

  useEffect(() => {
    setSelectedProductId((current) => {
      const firstRecommendedId = productOptions.find((product) => recommendations.has(product.id))?.id;
      const currentExists = productOptions.some((product) => product.id === current);
      if (!currentExists) return firstRecommendedId ?? productOptions[0]?.id ?? "";
      if (!recommendations.has(current) && firstRecommendedId) return firstRecommendedId;
      return current;
    });
  }, [productOptions, recommendations]);

  const selectedProduct = productOptions.find((product) => product.id === selectedProductId) ?? null;
  const recommendation = recommendations.get(selectedProductId) ?? null;
  const busy = busyProductId === selectedProductId;
  const pending = pendingImage?.productId === selectedProductId ? pendingImage : null;
  const previewUrl = generatedImageUrl ?? (selectedProduct?.image?.startsWith("https://") ? selectedProduct.image : null);
  const sourceDailyBudget = recommendation ? formatDailyBudget(recommendation.config.daily_budget, locale) : null;

  async function importGeneratedImage(image: PendingImage) {
    setBusyProductId(image.productId);
    setActionMessage("");
    try {
      const imageResponse = await fetch(image.imageUrl, { cache: "no-store" });
      if (!imageResponse.ok) throw new Error(en ? "The image is ready, but could not be retrieved. Retry the import." : "L’image est prête, mais ne peut pas être récupérée. Réessaie l’import.");
      const blob = await imageResponse.blob();
      if (blob.type && !blob.type.startsWith("image/")) throw new Error(en ? "The generated file is not a usable image." : "Le fichier généré n’est pas une image exploitable.");
      const mimeType = blob.type || "image/png";
      const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
      const product = productOptions.find((item) => item.id === image.productId);
      const file = new File([blob], `${cleanName(product?.name ?? "vendeo-image")}.${extension}`, { type: mimeType });
      const uploaded = await uploadCampaignMedia(file);
      if (typeof uploaded.secure_url !== "string" || !uploaded.secure_url.startsWith("https://")) throw new Error(en ? "The image could not be verified for campaign use." : "Le visuel n’a pas été validé pour la campagne.");
      const source = recommendations.get(image.productId);
      if (!source || source.campaign.campaignId !== image.campaignId) throw new Error(en ? "The campaign recommendation is no longer available. Refresh and try again." : "La proposition n’est plus disponible. Actualise puis réessaie.");
      onApplyCampaign({
        ...source.config,
        media_url: uploaded.secure_url,
        carousel_urls: [],
        product_id: image.productId,
        product_name: product?.name ?? source.campaign.productName ?? source.config.product_name,
        geographyRecommendationUnavailable: true,
      });
      setPendingImage(null);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : (en ? "The image could not be prepared." : "Le visuel n’a pas pu être préparé."));
    } finally {
      setBusyProductId(null);
    }
  }

  async function applyRecommendation() {
    if (readOnly || !storeId || !selectedProduct || !recommendation || busyProductId) return;
    setBusyProductId(selectedProduct.id);
    setActionMessage("");
    setGeneratedImageUrl(null);
    setPendingImage(null);
    try {
      const ideasResponse = await fetch(`/api/creative-performance/ideas?days=${encodeURIComponent(periodDays)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, productId: selectedProduct.id }),
      });
      const ideasBody = await ideasResponse.json().catch(() => ({}));
      if (!ideasResponse.ok || !ideasBody.eligible || !Array.isArray(ideasBody.ideas)) {
        throw new Error(ideasBody.message || ideasBody.error || (en ? "There is not enough verified data for a recommendation yet." : "Les données fiables ne suffisent pas encore pour proposer une campagne."));
      }
      const idea = ideasBody.ideas.find((item: { format?: string }) => item?.format === "image");
      if (!idea || !ideasBody.source) throw new Error(en ? "No image proposal is available for this product." : "Aucune proposition d’image n’est disponible pour ce produit.");

      const productLite = {
        id: selectedProduct.id,
        name: selectedProduct.name,
        description: selectedProduct.description ?? null,
        price: selectedProduct.price ?? null,
        currency: selectedProduct.currency ?? null,
        image: selectedProduct.image ?? null,
      };
      const imageResponse = await fetch("/api/studio/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: idea.prompt,
          quality: "medium",
          resolution: "hd",
          orientation: "portrait",
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
      const image = { productId: selectedProduct.id, campaignId: recommendation.campaign.campaignId, imageUrl: imageBody.imageUrl };
      setGeneratedImageUrl(image.imageUrl);
      setPendingImage(image);
      await importGeneratedImage(image);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : (en ? "Unable to prepare the campaign." : "Impossible de préparer la campagne."));
    } finally {
      setBusyProductId(null);
    }
  }

  if (previewExamples && !loading && !recordsLoading && !recordsError && (!storeId || !productOptions.length || !recommendation)) {
    return <CampaignPerformanceDemo locale={locale} />;
  }

  return (
    <section className="creative-library ad-campaign-preparation" aria-labelledby="ad-campaign-title">
      <div className="ad-data-disclaimer" role="note">
        <Sparkles size={18} aria-hidden="true" />
        <div><strong>{en ? "RECOMMENDATION BASED ON MEASURED DATA" : "RECOMMANDATION FONDÉE SUR DES DONNÉES MESURÉES"}</strong>
          <span>{en ? "Campaign history and linked ad results are used only when they support a reliable starting point." : "L’historique des campagnes et leurs résultats publicitaires sont utilisés uniquement lorsqu’ils fournissent une base fiable."}</span>
        </div>
      </div>

      {loading ? <div className="creative-state" role="status">{en ? "Loading…" : "Chargement…"}</div>
        : !storeId ? previewExamples ? <CampaignPerformanceDemo locale={locale} /> : <div className="creative-state">{en ? "Connect a store first." : "Connecte d’abord une boutique."}</div>
              : !productOptions.length ? previewExamples ? <CampaignPerformanceDemo locale={locale} /> : <div className="creative-empty">
            <div className="creative-empty-icon"><Sparkles size={22} aria-hidden="true" /></div>
            <h3>{en ? "No products available" : "Aucun produit disponible"}</h3>
            <p>{en ? "Connect a store with products to prepare a campaign." : "Connecte une boutique avec des produits pour préparer une campagne."}</p>
              </div>
            : <div className="ad-campaign-form">
              {recordsLoading ? <div className="ad-recommendation" role="status">{en ? "Checking for a proposal…" : "Recherche d’une proposition…"}</div>
                : recordsError ? <div className="creative-error" role="alert">{en ? "A proposal could not be prepared right now. Try again later." : "Impossible de préparer une proposition pour le moment. Réessaie plus tard."}</div>
                  : recommendation ? <div className="ad-recommendation" aria-live="polite">
                    <div className="ad-recommendation-layout">
                      <div className="ad-recommendation-details">
                        <div className="ad-recommendation-heading">
                          <span className="ad-recommendation-icon"><Sparkles size={18} aria-hidden="true" /></span>
                          <div>
                            <h3 id="ad-campaign-title">{en ? "Campaign recommendation" : "Recommandation de campagne"}</h3>
                            <p>{en
                              ? "A complete suggestion based on measured campaign results, ready to review and personalize."
                              : "Une suggestion complète, issue des résultats mesurés, prête à être vérifiée et personnalisée."}</p>
                          </div>
                        </div>

                        <dl className="ad-config-grid">
                          <div><dt>{en ? "Product" : "Produit"}</dt><dd>{productOptions.length > 1 ? <select className="ad-inline-product-select" value={selectedProductId} onChange={(event) => { setSelectedProductId(event.target.value); setActionMessage(""); setPendingImage(null); setGeneratedImageUrl(null); }} aria-label={en ? "Choose a product" : "Choisir un produit"}>{productOptions.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select> : (selectedProduct?.name || "—")}</dd></div>
                          <div><dt>{en ? "Platform" : "Plateforme"}</dt><dd>{platformLabel(recommendation.config.platform, en)}</dd></div>
                          <div><dt>{en ? "Geography / audience" : "Pays / audience"}</dt><dd>{en ? "Not recommended: reliable geographic attribution is unavailable." : "Non recommandé : aucune attribution géographique fiable ne permet de choisir un pays ou une audience."}</dd></div>
                          <div><dt>{en ? "Creative format" : "Format créatif"}</dt><dd>{en ? "One HD vertical image · 9:16" : "Une image HD verticale · 9:16"}</dd></div>
                          <div><dt>{en ? "Headline" : "Titre"}</dt><dd>{recommendation.config.title?.trim() || (en ? "To complete in the draft" : "À compléter dans le brouillon")}</dd></div>
                          <div className="ad-config-wide"><dt>{en ? "Ad text" : "Texte"}</dt><dd>{recommendation.config.ad_text?.trim() || (en ? "To complete in the draft" : "À compléter dans le brouillon")}</dd></div>
                          <div><dt>{en ? "Description" : "Description"}</dt><dd>{en ? "Not available in the source campaign settings." : "Non renseignée dans la configuration source."}</dd></div>
                          <div><dt>{en ? "Daily budget · source setting" : "Budget quotidien · réglage source"}</dt><dd>{sourceDailyBudget ? `${sourceDailyBudget} / ${en ? "day" : "jour"}` : (en ? "Not available" : "Non disponible")}</dd></div>
                          <div><dt>{en ? "Duration · source setting" : "Durée · réglage source"}</dt><dd>{Number(recommendation.config.duration_days) > 0 ? `${recommendation.config.duration_days} ${en ? "days" : "jours"}` : (en ? "Not available" : "Non disponible")}</dd></div>
                        </dl>
                        <p className="ad-source-note">{en
                          ? "Headline, text, budget and duration are shown from the measured source campaign and can be reviewed or changed in the draft. Geography is not inferred from store locations or country sales."
                          : "Le titre, le texte, le budget et la durée proviennent du réglage de la campagne source et restent modifiables dans le brouillon. Aucun pays gagnant n’est déduit des lieux de visite ou des ventes par pays."}</p>
                      </div>

                      <aside className="ad-visual-preview" aria-label={en ? "Creative preview" : "Aperçu du visuel"}>
                        <div className="ad-preview-head"><strong>{en ? "Creative preview" : "Aperçu du visuel"}</strong><span>9:16</span></div>
                        <div className="ad-visual-frame">
                          <div className="ad-phone-shell"><div className="ad-phone-screen">
                            {previewUrl ? <img className="ad-phone-image" src={previewUrl} alt={generatedImageUrl ? (en ? "Generated campaign image" : "Visuel de campagne généré") : (en ? "Product image reference" : "Image produit de référence")} /> : <div className="ad-phone-image placeholder" aria-hidden="true" />}
                            <div className="ad-phone-sponsored"><span className="ad-phone-avatar">V</span><span>Vendeo<small>{en ? "Sponsored" : "Sponsorisé"}</small></span><span className="ad-phone-close" aria-hidden="true">×</span></div>
                            <div className="ad-phone-cta"><span>{recommendation.config.title?.trim() || (en ? "Discover your new routine" : "Découvrez votre nouvelle routine")}</span><span aria-hidden="true">›</span></div>
                          </div></div>
                        </div>
                        <small>{generatedImageUrl
                          ? (en ? "Generated image" : "Visuel généré")
                          : selectedProduct?.image ? (en ? "Product image · reference only" : "Image du produit · référence uniquement") : (en ? "No sample visual is shown" : "Aucun visuel d’exemple n’est affiché")}</small>
                      </aside>
                    </div>

                    {actionMessage ? <p className="ad-action-message" role="alert">{actionMessage}</p> : null}
                    <div className="ad-action-footer">
                      <div className="ad-apply-area">
                        {pending ? <div className="ad-pending-image" role="status">
                          <span>{en ? "The image is ready. Retry the import without generating it again." : "L’image est prête. Réessaie l’import sans la générer à nouveau."}</span>
                          <button type="button" className="creative-studio-link" disabled={busy || readOnly} onClick={() => void importGeneratedImage(pending)}>
                            <ImagePlus size={14} /> {busy ? (en ? "Preparing…" : "Préparation…") : (en ? "Retry import" : "Réessayer l’import")}
                          </button>
                        </div> : <button type="button" className="ad-apply-button" disabled={busy || readOnly || Boolean(generatedImageUrl)} onClick={() => void applyRecommendation()}>
                          {busy ? <><Loader2 size={16} className="creative-spin" /> {en ? "Preparing…" : "Préparation…"}</> : generatedImageUrl ? <><ImagePlus size={16} /> {en ? "Image generated · draft ready" : "Image générée · brouillon prêt"}</> : <><ImagePlus size={16} /> {en ? `Apply · ${generationCost} credits` : `Appliquer · ${generationCost} crédits`}</>}
                        </button>}
                        <small className="ad-credit-note">{en
                          ? `The displayed action generates one HD portrait image for ${generationCost} Studio credits, then prepares a draft. Nothing is published automatically.`
                          : `L’action affichée génère une image HD verticale pour ${generationCost} crédits Studio, puis prépare un brouillon. Rien n’est publié automatiquement.`}</small>
                      </div>
                      <div className="ad-review-step" role="note">
                        <span className="ad-review-icon"><FileText size={18} aria-hidden="true" /></span>
                        <div><strong>{en ? "Review the draft before launch" : "Relis le brouillon avant le lancement"}</strong>
                          <p>{en
                            ? "After generation, review the platform, audience, copy and total budget in the draft. The separate “Launch now” button is the only action that sends the campaign."
                            : "Après génération, vérifie la plateforme, le ciblage, le texte et le budget total dans le brouillon. Seul le bouton distinct « Lancer maintenant » envoie la campagne."}</p>
                        </div>
                        <button type="button" className="ad-launch-button" disabled={busy || readOnly} onClick={() => onApplyCampaign(recommendation.config)}>
                          <Play size={15} /> {en ? "Launch now" : "Lancer maintenant"}
                        </button>
                      </div>
                    </div>
                  </div>
                    : previewExamples ? <CampaignPerformanceDemo locale={locale} /> : <div className="ad-recommendation" role="status">
                      <h3>{en ? "No proposal for this product yet" : "Pas encore de proposition pour ce produit"}</h3>
                      <p>{en ? "Vendeo will show an action here when the available results support a reliable recommendation." : "Vendeo affichera une action ici lorsque les résultats disponibles permettront une proposition fiable."}</p>
                    </div>}
            </div>}
    </section>
  );
}
