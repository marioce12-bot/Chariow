import { NextResponse } from "next/server";
import { decryptSecret } from "@/lib/crypto";
import { createTikTokAd, createTikTokAdGroup, createTikTokCampaign, deleteTikTokCampaign, uploadTikTokAdImage } from "./campaigns";
import { fetchTikTokIdentities, fetchTikTokPixels, resolveTikTokLocationIds } from "./api";
import { createTikTokVideoAd, isVideoUrl, uploadTikTokAdVideo, videoCoverUrl } from "./video";

// Lancement d'une campagne TikTok. Ordre voulu :
// 1. TOUTES les vérifications (compte, identité, pays, pixel) AVANT de créer quoi
//    que ce soit chez TikTok — sinon chaque échec/"Réessayer" laisse une campagne
//    orpheline.
// 2. Création campagne -> ad group -> média -> pub.
// 3. Si une étape échoue après la création de la campagne, on la supprime chez
//    TikTok pour que "Réessayer" reparte de zéro sans doublon.
export async function launchTikTok(supabase: any, userId: string, campaign: any, body: any) {
  const accountId = typeof body?.tiktok_ad_account_id === "string" ? body.tiktok_ad_account_id : campaign.tiktok_ad_account_id;
  if (!accountId) return NextResponse.json({ error: "Sélectionne un compte TikTok Ads" }, { status: 400 });
  const { data: account, error: accountError } = await supabase.from("tiktok_ad_accounts").select("id,tiktok_advertiser_id,tiktok_integration_id,is_active").eq("id", accountId).eq("user_id", userId).maybeSingle();
  if (accountError) return NextResponse.json({ error: "Impossible de vérifier le compte TikTok" }, { status: 500 });
  if (!account?.is_active) return NextResponse.json({ error: "Le compte TikTok sélectionné n’est plus actif" }, { status: 400 });
  const { data: integration, error: integrationError } = await supabase.from("tiktok_integrations").select("access_token_encrypted").eq("id", account.tiktok_integration_id).eq("user_id", userId).maybeSingle();
  if (integrationError || !integration) return NextResponse.json({ error: "Intégration TikTok introuvable" }, { status: 404 });
  await supabase.from("ad_campaigns").update({ tiktok_ad_account_id: account.id, external_error: null }).eq("id", campaign.id).eq("user_id", userId);

  const advertiserId: string = account.tiktok_advertiser_id;
  let accessToken = "";
  let createdCampaignId: string | null = null;
  try {
    accessToken = decryptSecret(integration.access_token_encrypted);
    const campaignName = campaign.title || campaign.product_name || "Campagne Vendeo";

    // --- 1. Vérifications préalables (rien n'est encore créé chez TikTok) ---

    // Identité : TikTok exige une identité (compte lié ou identité personnalisée)
    // pour diffuser une pub. On prend la première identité exploitable du compte,
    // en évitant BC_AUTH_TT qui exige un Business Center id.
    let identityId = typeof body?.identity_id === "string" && body.identity_id ? body.identity_id : null;
    let identityType = typeof body?.identity_type === "string" && body.identity_type ? body.identity_type : null;
    if (!identityId || !identityType) {
      const identities = await fetchTikTokIdentities(advertiserId, accessToken);
      const order = ["TT_USER", "AUTH_CODE", "CUSTOMIZED_USER"];
      const rows = identities as Array<Record<string, unknown>>;
      const chosen = order
        .map((type) => rows.find((i) => String(i.identity_type).toUpperCase() === type))
        .find((identity) => identity != null) ?? rows[0];
      identityId = chosen ? String(chosen.identity_id ?? "") || null : null;
      identityType = chosen ? String(chosen.identity_type ?? "") || null : null;
    }
    if (!identityId || !identityType) return NextResponse.json({ error: "Aucune identité TikTok disponible sur ce compte. Crée une identité (profil) dans TikTok Ads Manager > Actifs > Identités, puis réessaie." }, { status: 400 });

    // Ciblage géographique : TikTok cible par location_id numérique, pas par code pays ISO.
    const targetCountries = campaign.countries?.length ? campaign.countries : ["BJ"];
    const { locationIds, unsupportedCountryCodes } = await resolveTikTokLocationIds(advertiserId, accessToken, targetCountries);
    if (unsupportedCountryCodes.length) {
      return NextResponse.json({
        error: `Ce compte TikTok ne permet pas de cibler : ${unsupportedCountryCodes.join(", ")}. Retire ces pays ou sélectionne un compte publicitaire qui les prend en charge.`,
        unsupported_countries: unsupportedCountryCodes,
      }, { status: 400 });
    }
    if (!locationIds.length) return NextResponse.json({ error: "TikTok n’autorise pas la diffusion dans les pays choisis." }, { status: 400 });

    // Objectif "ventes"/"leads" : optimization_goal CONVERT exige un pixel TikTok.
    const needsPixel = campaign.objective === "sales" || campaign.objective === "leads";
    let pixelId: string | null = null;
    if (needsPixel) {
      const pixels = await fetchTikTokPixels(advertiserId, accessToken);
      const pixel = pixels[0] as Record<string, unknown> | undefined;
      pixelId = pixel ? String(pixel.pixel_id ?? "") || null : null;
      if (!pixelId) return NextResponse.json({ error: "Cet objectif nécessite un Pixel TikTok (Events) configuré sur ta boutique. Ajoute-en un dans TikTok Ads Manager > Events, puis réessaie." }, { status: 400 });
    }

    // --- 2. Création chez TikTok ---
    const external = await createTikTokCampaign({ advertiserId, accessToken, name: campaignName, objective: campaign.objective });
    createdCampaignId = external.id;
    const adGroup = await createTikTokAdGroup({ advertiserId, accessToken, campaignId: external.id, name: `${campaignName} - Audience`, dailyBudget: Number(campaign.daily_budget), locationIds, minAge: Number(campaign.min_age), maxAge: Number(campaign.max_age), identityId, identityType, pixelId: pixelId ?? undefined, objective: campaign.objective });

    let creativeId: string;
    let ad: { id: string };
    if (isVideoUrl(campaign.media_url)) {
      const coverUrl = videoCoverUrl(campaign.media_url);
      if (!coverUrl) throw new Error("Impossible de générer l'image de couverture de la vidéo");
      const video = await uploadTikTokAdVideo({ advertiserId, accessToken, videoUrl: campaign.media_url });
      const cover = await uploadTikTokAdImage({ advertiserId, accessToken, imageUrl: coverUrl });
      creativeId = video.videoId;
      ad = await createTikTokVideoAd({ advertiserId, accessToken, adgroupId: adGroup.id, name: `${campaignName} - Ad`, identityId, identityType, videoId: video.videoId, coverImageId: cover.imageId, text: campaign.ad_text, link: campaign.destination_url });
    } else {
      const image = await uploadTikTokAdImage({ advertiserId, accessToken, imageUrl: campaign.media_url });
      creativeId = image.imageId;
      ad = await createTikTokAd({ advertiserId, accessToken, adgroupId: adGroup.id, name: `${campaignName} - Ad`, identityId, identityType, imageId: image.imageId, text: campaign.ad_text, link: campaign.destination_url });
    }
    if (!ad.id) throw new Error("TikTok n'a pas renvoyé d'identifiant de publicité");

    const { data: updated, error: updateError } = await supabase.from("ad_campaigns").update({ status: "review", tiktok_ad_account_id: account.id, external_campaign_id: external.id, external_adset_id: adGroup.id, external_creative_id: creativeId, external_ad_id: ad.id, external_error: null }).eq("id", campaign.id).eq("user_id", userId).select("id,status,external_campaign_id,external_adset_id,external_creative_id,external_ad_id").single();
    if (updateError) return NextResponse.json({ error: "Campagne TikTok créée mais statut Vendeo non enregistré" }, { status: 502 });
    return NextResponse.json({ campaign: updated });
  } catch (error) {
    // Nettoyage : on supprime la campagne créée à moitié pour éviter les doublons au prochain essai.
    if (createdCampaignId && accessToken) {
      await deleteTikTokCampaign({ advertiserId, accessToken, campaignId: createdCampaignId }).catch(() => undefined);
    }
    let message = error instanceof Error ? error.message.slice(0, 500) : "TikTok campaign creation failed";
    if (/budget/i.test(message)) message += " (le budget quotidien doit respecter le minimum TikTok, environ 20 $ ou l'équivalent dans la devise de ton compte)";
    await supabase.from("ad_campaigns").update({ external_error: message }).eq("id", campaign.id).eq("user_id", userId);
    return NextResponse.json({ error: `TikTok n’a pas accepté la campagne : ${message}. Réessaie.` }, { status: 502 });
  }
}
