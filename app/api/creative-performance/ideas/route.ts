import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { loadCreativePerformance, parseCreativePeriod } from "@/lib/creative-performance/service";
import { isPreviewEnabled } from "@/lib/studio/slideshow-server";
import { selectVisualIdeaCampaign } from "@/lib/creative-performance/idea-candidates";

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.storeId !== "string" || typeof body.productId !== "string") {
    return NextResponse.json({ error: "Choisis un produit et une boutique." }, { status: 400 });
  }
  const { data: store, error: storeError } = await supabase.from("stores")
    .select("id").eq("id", body.storeId).eq("user_id", user.id).eq("is_active", true).maybeSingle();
  if (storeError || !store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  try {
    const period = parseCreativePeriod(new URL(request.url).searchParams);
    const performance = await loadCreativePerformance({ supabase, userId: user.id, storeId: body.storeId, period });
    const eligibility = performance.productEligibility.find((item) => item.productId === body.productId);
    if (!eligibility?.eligible) {
      return NextResponse.json({
        eligible: false,
        reason: "need_more_data",
        message: "Ce produit doit avoir une campagne réellement lancée avec des résultats mesurés avant de proposer des idées Studio.",
        launchedCampaigns: eligibility?.launchedCampaigns ?? 0,
        analyzedCampaigns: eligibility?.analyzedCampaigns ?? 0,
        ideas: [],
      }, { headers: { "Cache-Control": "private, no-store" } });
    }

    const media = body.assetId ? performance.media.find((row) => row.id === body.assetId) : null;
    if (body.assetId && (!media || !media.campaigns.some((row) => row.productId === body.productId))) {
      return NextResponse.json({ error: "Ce média n’est pas associé à ce produit." }, { status: 404 });
    }
    const linkedCampaignIds = media
      ? new Set(media.campaigns.filter((row) => row.productId === body.productId && row.metrics.available &&
        row.metrics.attributionReliable && row.metrics.attributedRevenue !== null && row.metrics.attributedCurrency === row.metrics.currency &&
        row.metrics.attributedRevenue > (row.metrics.spend ?? Number.POSITIVE_INFINITY)).map((row) => row.campaignId))
      : null;
    if (media && !linkedCampaignIds?.size) {
      return NextResponse.json({
        eligible: false, reason: "need_more_data",
        message: "Ce créatif n’a pas de résultats distincts et attribués qui le classent gagnant. Utilise les idées au niveau du produit si ses campagnes sont analysées.",
        launchedCampaigns: eligibility.launchedCampaigns, analyzedCampaigns: eligibility.analyzedCampaigns, ideas: [],
      }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const sourceCampaign = selectVisualIdeaCampaign(performance.campaigns, body.productId, linkedCampaignIds);
    if (!sourceCampaign) {
      return NextResponse.json({
        eligible: false, reason: "need_more_data",
        message: "Aucune idée fiable n’est disponible pour ce produit à partir des résultats mesurés.",
        launchedCampaigns: eligibility.launchedCampaigns, analyzedCampaigns: eligibility.analyzedCampaigns, ideas: [],
      }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const metrics = sourceCampaign.metrics!;
    const { data: sourceSnapshot, error: sourceSnapshotError } = await supabase.from("creative_campaign_metric_snapshots")
      .select("metric_scope,spend,clicks,impressions,attributed_orders,attributed_revenue,attributed_currency,currency")
      .eq("user_id", user.id).eq("store_id", body.storeId).eq("campaign_key", sourceCampaign.campaignId)
      .eq("period_from", period.from).eq("period_to", period.to).maybeSingle();
    if (sourceSnapshotError) throw sourceSnapshotError;
    if (!sourceSnapshot || sourceSnapshot.metric_scope === "unavailable") {
      return NextResponse.json({
        eligible: false, reason: "need_more_data",
        message: "Les résultats réels n’ont pas pu être conservés dans l’historique. Aucune idée Studio n’a été proposée.",
        launchedCampaigns: eligibility.launchedCampaigns, analyzedCampaigns: eligibility.analyzedCampaigns, ideas: [],
      }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const evidence = metrics.attributedOrders !== null && metrics.attributedRevenue !== null && metrics.attributedCurrency
      ? `${metrics.attributedOrders} commandes attribuées et ${metrics.attributedRevenue.toFixed(2)} ${metrics.attributedCurrency} de chiffre d’affaires attribué.`
      : `${metrics.clicks} clics et ${metrics.impressions} impressions mesurés; les commandes et le chiffre d’affaires attribués ne sont pas disponibles de façon fiable.`;
    const campaignName = sourceCampaign.name;
    const productName = eligibility.productName || sourceCampaign.productName || "le produit sélectionné";
    const source = {
      storeId: body.storeId, productId: body.productId, productName,
      assetId: media?.id ?? null, campaignId: sourceCampaign.campaignId,
      imageUrl: media?.kind === "image" ? media.url : null,
      campaignName, platform: sourceCampaign.platform, period,
      evidence: {
        scope: sourceSnapshot.metric_scope, currency: metrics.currency, spend: metrics.spend,
        clicks: metrics.clicks, impressions: metrics.impressions,
        attributedOrders: metrics.attributedOrders, attributedRevenue: metrics.attributedRevenue,
        attributedCurrency: metrics.attributedCurrency,
      },
    };
    const referenceNote = media?.kind === "image"
      ? "Utilise l’image source comme référence visuelle; conserve un rendu distinct et n’ajoute aucun bénéfice produit non documenté."
      : media
        ? "Utilise les résultats historiques du média comme contexte, pas comme référence visuelle; crée à partir des informations documentées du produit et n’ajoute aucun bénéfice non vérifié."
        : "Crée une composition originale et n’ajoute aucun bénéfice produit non documenté.";
    const ideas = [
      {
        id: "performance-image-angle",
        title: "Décliner l’angle mesuré en image",
        format: "image",
        rationale: `Source : « ${campaignName} » (${sourceCampaign.platform}). ${evidence} L’idée conserve la référence mesurée comme point de départ; ce n’est pas une prévision de résultat.`,
        prompt: `Créer une publicité image originale pour ${productName}. S’inspirer de l’angle créatif de la campagne « ${campaignName} », sans reprendre une promesse qui n’apparaît pas dans les données produit. ${referenceNote} Mettre le produit clairement en valeur, avec une accroche courte et lisible. Résultats historiques de la campagne source (contexte seulement, ne pas afficher comme promesse) : ${evidence}`,
      },
      {
        id: "performance-slideshow-benefit",
        title: "Raconter le produit en diaporama",
        format: "slideshow",
        rationale: `Le format diaporama teste une narration en plusieurs scènes à partir de la campagne mesurée « ${campaignName} ». ${evidence}`,
        prompt: `Préparer un diaporama publicitaire vertical en cinq scènes pour ${productName}. S’appuyer sur la campagne source « ${campaignName} » comme hypothèse de départ; tester une présentation claire du produit plutôt que prétendre que les résultats seront reproduits. ${referenceNote} N’inventer ni caractéristiques, ni avis, ni résultats. Mesures historiques de référence : ${evidence}`,
      },
      {
        id: "performance-image-proof",
        title: "Tester une seconde composition image",
        format: "image",
        rationale: `Cette variante sert de test comparatif à la campagne « ${campaignName} »; elle conserve les mêmes données réelles comme référence et ne transforme pas les clics en preuve de ventes. ${evidence}`,
        prompt: `Créer une seconde composition publicitaire en image pour ${productName}, différente de la campagne « ${campaignName} » afin de pouvoir comparer les créations. Garder le produit au premier plan, améliorer la hiérarchie visuelle et rester fidèle aux informations réellement disponibles. ${referenceNote} Ne pas présenter les résultats historiques comme des résultats de cette nouvelle création. Contexte mesuré : ${evidence}`,
      },
    ];
    if (!isPreviewEnabled()) {
      ideas[1] = {
        id: "performance-image-composition",
        title: "Tester une nouvelle composition image",
        format: "image",
        rationale: `Une variante image permet de comparer une composition différente à la campagne mesurée « ${campaignName} ». ${evidence}`,
        prompt: `Créer une publicité image originale pour ${productName}, différente de la campagne « ${campaignName} ». Conserver seulement les faits produit confirmés et utiliser le média source comme contexte de performance, jamais comme preuve ou promesse. ${referenceNote} Mesures historiques de référence : ${evidence}`,
      };
    }
    return NextResponse.json({
      eligible: true, source, ideas,
      capabilities: { image: true, slideshow: isPreviewEnabled(), video: false, videoMessage: "La génération vidéo Studio reste verrouillée par le produit." },
      message: "Les idées sont des hypothèses basées sur des résultats mesurés, pas des résultats garantis.",
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suggestions indisponibles.";
    const migrationMissing = /creative_media_(assets|placements|asset_urls)|creative_campaign_metric_snapshots/i.test(message);
    return NextResponse.json({
      error: migrationMissing ? "La migration des visuels publicitaires n’est pas disponible. Aucune idée n’a été proposée." : message,
      code: migrationMissing ? "CREATIVE_LIBRARY_NOT_READY" : "CREATIVE_IDEAS_UNAVAILABLE",
    }, { status: migrationMissing ? 503 : 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
