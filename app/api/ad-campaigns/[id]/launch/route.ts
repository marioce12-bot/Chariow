import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { activateMetaCampaign, createMetaAd, createMetaAdSet, createMetaCampaign, createMetaCreative } from "@/lib/meta/campaigns";
import { fetchMetaPageAccessToken, getMetaAccountFunding, describeMetaFundingIssue } from "@/lib/meta/api";
import { createTikTokAd, createTikTokAdGroup, createTikTokCampaign, uploadTikTokAdImage } from "@/lib/tiktok/campaigns";
import { metaPublisherPlatforms, isPlanId } from "@/lib/plans";

type Context = { params: Promise<{ id: string }> };

// Cette route envoie la campagne à Meta/TikTok — en ACTIVE directement, puisque
// le paiement (cf. /checkout) est désormais confirmé avant qu'on l'appelle.
// Elle n'est donc autorisée QUE sur une campagne "paid" : impossible d'appeler
// /launch avant d'avoir payé, ce qui garantit que la capture d'écran pour la
// vérification Meta Business montre bien "créer sur Vendeo → payer → envoyer à
// Meta" dans cet ordre, jamais l'inverse.
//
// Si Meta/TikTok refuse la création, on NE remet PAS le statut à "error" : on
// garde "paid" (avec external_error renseigné) pour que l'utilisateur puisse
// cliquer à nouveau sur "Réessayer" sans jamais repayer — le paiement n'est
// jamais perdu.
//
// Cas particulier (compatibilité) : si la campagne a déjà des identifiants
// externes (external_campaign_id/adset/ad) — c'est-à-dire qu'elle a été créée
// chez Meta en PAUSED sous l'ancien flux avant d'être payée — on ne recrée rien
// (ce qui dupliquerait la campagne côté Meta) : on se contente de l'activer.
export async function POST(request: Request, context: Context) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const { data: campaign, error: campaignError } = await supabase
    .from("ad_campaigns")
    .select("id,store_id,title,product_name,platform,objective,daily_budget,countries,min_age,max_age,destination_url,ad_text,media_url,status,meta_ad_account_id,tiktok_ad_account_id,external_campaign_id,external_adset_id,external_ad_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (campaignError) return NextResponse.json({ error: "Impossible de charger la campagne" }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  if (campaign.status !== "paid") {
    // Idempotent : si le lancement a déjà réussi (retry du client après un
    // rafraîchissement par ex.), on ne renvoie pas d'erreur bloquante.
    if (["review", "active"].includes(campaign.status)) return NextResponse.json({ campaign });
    return NextResponse.json({ error: "Le paiement doit d'abord être confirmé avant de lancer la campagne." }, { status: 409 });
  }
  if (!campaign.media_url || !campaign.media_url.startsWith("https://")) return NextResponse.json({ error: "Ajoute une image ou une vidéo avant de lancer la campagne" }, { status: 400 });

  if (campaign.platform === "tiktok") return launchTikTok(supabase, user.id, campaign, body);
  return launchMeta(supabase, user.id, campaign, body);
}

async function launchMeta(supabase: any, userId: string, campaign: any, body: any) {
  const accountId = typeof body?.meta_ad_account_id === "string" ? body.meta_ad_account_id : campaign.meta_ad_account_id;
  const pageId = typeof body?.page_id === "string" ? body.page_id : null;
  if (!accountId) return NextResponse.json({ error: "Sélectionne un compte Meta Ads" }, { status: 400 });
  const { data: account, error: accountError } = await supabase.from("meta_ad_accounts").select("id,meta_account_id,access_token_encrypted,is_active,account_status").eq("id", accountId).eq("user_id", userId).maybeSingle();
  if (accountError) return NextResponse.json({ error: "Impossible de vérifier le compte Meta" }, { status: 500 });
  if (!account?.is_active) return NextResponse.json({ error: "Le compte Meta sélectionné n’est plus actif" }, { status: 400 });
  const accessToken = decryptSecret(account.access_token_encrypted);

  // Cas de reprise (ancien flux) : la campagne existe déjà chez Meta en PAUSED —
  // on l'active simplement au lieu d'en recréer une deuxième.
  if (campaign.external_campaign_id && campaign.external_adset_id && campaign.external_ad_id) {
    try {
      await activateMetaCampaign({ campaignId: campaign.external_campaign_id, adSetId: campaign.external_adset_id, adId: campaign.external_ad_id, accessToken });
      const { data: updated, error: updateError } = await supabase.from("ad_campaigns").update({ status: "review", external_error: null }).eq("id", campaign.id).eq("user_id", userId).select("id,status,external_campaign_id,external_adset_id,external_creative_id,external_ad_id").single();
      if (updateError) return NextResponse.json({ error: "Campagne activée chez Meta mais statut Vendeo non enregistré" }, { status: 502 });
      await supabase.from("meta_campaigns").update({ status: "ACTIVE" }).eq("meta_campaign_id", campaign.external_campaign_id);
      return NextResponse.json({ campaign: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Activation Meta échouée";
      await supabase.from("ad_campaigns").update({ external_error: message }).eq("id", campaign.id).eq("user_id", userId);
      return NextResponse.json({ error: `Paiement confirmé, mais Meta n’a pas accepté l’activation : ${message}. Réessaie — le paiement n’est pas perdu.` }, { status: 502 });
    }
  }

  if (!pageId) return NextResponse.json({ error: "Sélectionne une page Facebook avant de lancer la campagne" }, { status: 400 });

  try {
    const funding = await getMetaAccountFunding(`act_${account.meta_account_id}`, accessToken);
    const issue = describeMetaFundingIssue(funding);
    if (issue) return NextResponse.json({ error: issue.message, code: issue.code, account_quality_url: "https://www.facebook.com/accountquality", billing_url: "https://business.facebook.com/billing_hub" }, { status: 400 });
  } catch (fundingError) {
    // Si Meta est momentanément indisponible pour cette vérification, on ne bloque pas
    // le lancement pour autant — Meta refusera de toute façon la création si besoin.
  }

  const { data: subscription } = await supabase.from("subscriptions").select("plan").eq("user_id", userId).maybeSingle();
  const plan = isPlanId(subscription?.plan) ? subscription.plan : "starter";
  const publisherPlatforms = metaPublisherPlatforms(plan);
  await supabase.from("ad_campaigns").update({ meta_ad_account_id: account.id, external_error: null }).eq("id", campaign.id).eq("user_id", userId);
  try {
    const pageAccessToken = await fetchMetaPageAccessToken(pageId, accessToken);
    const campaignName = campaign.title || campaign.product_name || "Campagne Vendeo";
    // Le paiement est déjà confirmé (status "paid") : on crée directement en ACTIVE,
    // ce qui soumet immédiatement la campagne à la modération Meta.
    const external = await createMetaCampaign({ accountId: `act_${account.meta_account_id}`, accessToken, name: campaignName, objective: campaign.objective, dailyBudget: Number(campaign.daily_budget), status: "ACTIVE" });
    const adSet = await createMetaAdSet({ accountId: `act_${account.meta_account_id}`, accessToken, campaignId: external.id, name: `${campaignName} - Audience`, dailyBudget: Number(campaign.daily_budget), countries: campaign.countries?.length ? campaign.countries : ["BJ"], minAge: Number(campaign.min_age), maxAge: Number(campaign.max_age), publisherPlatforms, status: "ACTIVE" });
    const creative = await createMetaCreative({ accountId: `act_${account.meta_account_id}`, accessToken, name: `${campaignName} - Creative`, pageId, link: campaign.destination_url, message: campaign.ad_text, headline: campaignName, imageUrl: campaign.media_url });
    const ad = await createMetaAd({ accountId: `act_${account.meta_account_id}`, accessToken, name: `${campaignName} - Ad`, adsetId: String(adSet.id), creativeId: String(creative.id), status: "ACTIVE" });
    const { data: updated, error: updateError } = await supabase.from("ad_campaigns").update({ status: "review", meta_ad_account_id: account.id, external_campaign_id: external.id, external_adset_id: String(adSet.id), external_creative_id: String(creative.id), external_ad_id: String(ad.id), external_error: null }).eq("id", campaign.id).eq("user_id", userId).select("id,status,external_campaign_id,external_adset_id,external_creative_id,external_ad_id").single();
    if (updateError) return NextResponse.json({ error: "Campagne Meta créée mais statut Vendeo non enregistré" }, { status: 502 });
    await supabase.from("meta_campaigns").upsert({ ad_account_id: account.id, meta_campaign_id: external.id, name: campaign.title || "Campagne Vendeo", status: "ACTIVE", objective: external.objective }, { onConflict: "ad_account_id,meta_campaign_id" });
    return NextResponse.json({ campaign: updated });
  } catch (error) {
    // Le paiement est déjà encaissé ici : on garde le statut "paid" (au lieu de
    // "error") pour permettre un nouveau clic sur "Réessayer" sans repayer.
    const message = error instanceof Error ? error.message.slice(0, 500) : "Meta campaign creation failed";
    await supabase.from("ad_campaigns").update({ external_error: message }).eq("id", campaign.id).eq("user_id", userId);
    return NextResponse.json({ error: `Paiement confirmé, mais Meta n’a pas accepté la campagne : ${message}. Réessaie — le paiement n’est pas perdu.` }, { status: 502 });
  }
}

async function launchTikTok(supabase: any, userId: string, campaign: any, body: any) {
  const accountId = typeof body?.tiktok_ad_account_id === "string" ? body.tiktok_ad_account_id : campaign.tiktok_ad_account_id;
  const identityId = typeof body?.identity_id === "string" ? body.identity_id : null;
  const identityType = typeof body?.identity_type === "string" ? body.identity_type : null;
  if (!accountId) return NextResponse.json({ error: "Sélectionne un compte TikTok Ads" }, { status: 400 });
  if (!identityId || !identityType) return NextResponse.json({ error: "Sélectionne une identité TikTok avant de lancer la campagne" }, { status: 400 });
  const { data: account, error: accountError } = await supabase.from("tiktok_ad_accounts").select("id,tiktok_advertiser_id,tiktok_integration_id,is_active").eq("id", accountId).eq("user_id", userId).maybeSingle();
  if (accountError) return NextResponse.json({ error: "Impossible de vérifier le compte TikTok" }, { status: 500 });
  if (!account?.is_active) return NextResponse.json({ error: "Le compte TikTok sélectionné n’est plus actif" }, { status: 400 });
  const { data: integration, error: integrationError } = await supabase.from("tiktok_integrations").select("access_token_encrypted").eq("id", account.tiktok_integration_id).eq("user_id", userId).maybeSingle();
  if (integrationError || !integration) return NextResponse.json({ error: "Intégration TikTok introuvable" }, { status: 404 });
  await supabase.from("ad_campaigns").update({ tiktok_ad_account_id: account.id, external_error: null }).eq("id", campaign.id).eq("user_id", userId);
  try {
    const accessToken = decryptSecret(integration.access_token_encrypted);
    const campaignName = campaign.title || campaign.product_name || "Campagne Vendeo";
    const external = await createTikTokCampaign({ advertiserId: account.tiktok_advertiser_id, accessToken, name: campaignName, objective: campaign.objective });
    const adGroup = await createTikTokAdGroup({ advertiserId: account.tiktok_advertiser_id, accessToken, campaignId: external.id, name: `${campaignName} - Audience`, dailyBudget: Number(campaign.daily_budget), countries: campaign.countries?.length ? campaign.countries : ["BJ"], minAge: Number(campaign.min_age), maxAge: Number(campaign.max_age), identityId, identityType, objective: campaign.objective });
    const image = await uploadTikTokAdImage({ advertiserId: account.tiktok_advertiser_id, accessToken, imageUrl: campaign.media_url });
    const ad = await createTikTokAd({ advertiserId: account.tiktok_advertiser_id, accessToken, adgroupId: adGroup.id, name: `${campaignName} - Ad`, identityId, identityType, imageId: image.imageId, text: campaign.ad_text, link: campaign.destination_url });
    const { data: updated, error: updateError } = await supabase.from("ad_campaigns").update({ status: "review", tiktok_ad_account_id: account.id, external_campaign_id: external.id, external_adset_id: adGroup.id, external_creative_id: image.imageId, external_ad_id: ad.id, external_error: null }).eq("id", campaign.id).eq("user_id", userId).select("id,status,external_campaign_id,external_adset_id,external_creative_id,external_ad_id").single();
    if (updateError) return NextResponse.json({ error: "Campagne TikTok créée mais statut Vendeo non enregistré" }, { status: 502 });
    return NextResponse.json({ campaign: updated });
  } catch (error) {
    // Comme pour Meta : le paiement est déjà encaissé, on garde "paid" pour un
    // nouvel essai sans repayer.
    const message = error instanceof Error ? error.message.slice(0, 500) : "TikTok campaign creation failed";
    await supabase.from("ad_campaigns").update({ external_error: message }).eq("id", campaign.id).eq("user_id", userId);
    return NextResponse.json({ error: `Paiement confirmé, mais TikTok n’a pas accepté la campagne : ${message}. Réessaie — le paiement n’est pas perdu.` }, { status: 502 });
  }
}
