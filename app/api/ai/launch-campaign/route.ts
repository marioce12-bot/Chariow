import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { toUsd } from "@/lib/currency";
import { createMetaCampaign, createMetaAdSet, createMetaAd, createMetaCreative, createMetaCarouselCreative, publishMetaAdWithAdvantage, deleteMetaCampaign } from "@/lib/meta/campaigns";
import { fetchMetaResources, getMetaAccountFunding, describeMetaFundingIssue } from "@/lib/meta/api";
import { prepareMetaCreativeImage } from "@/lib/meta/ad-image";
import { createMetaVideoCreative, isVideoMediaUrl, prepareMetaCreativeVideo } from "@/lib/meta/ad-video";
import { parseCarouselUrls } from "@/lib/meta/carousel";
import { normalizeMetaCta } from "@/lib/meta/cta";
import { withVendeoCampaignTracking } from "@/lib/meta/tracking";
import { launchPinterest } from "@/lib/pinterest/api";
import { PINTEREST_TAG_REQUIRED_CODE, isPinterestConversionTagError, pinterestTagChatMessage } from "@/lib/pinterest/tag-help";
import { TIKTOK_FROM_CHAT_MESSAGE } from "@/lib/launch-platform";
import { resolveChatCampaignStore } from "@/lib/chariow/campaign-store";

// Lance une campagne Meta complète via l'API Marketing directe (même chemin que
// /api/ad-campaigns/[id]/launch), à partir d'un brief validé par l'utilisateur
// dans l'assistant IA. Flux : campagne → ad set → creative (avec Advantage+
// créative) → ad (créée en PAUSED, aperçu, puis activée) — pas de passage par le
// serveur MCP publicités de Meta.
type LaunchBody = {
  name?: string;
  objective?: string; // OUTCOME_SALES | OUTCOME_TRAFFIC | OUTCOME_ENGAGEMENT | OUTCOME_LEADS | OUTCOME_AWARENESS
  dailyBudget?: number; // dans la devise `currency` (XOF par défaut) — converti en dollars ci-dessous
  currency?: string; // code ISO de la devise du budget saisi (XOF, EUR, USD…)
  countries?: string[];
  ageMin?: number;
  ageMax?: number;
  message?: string; // texte de la créative
  headline?: string;
  linkUrl?: string; // lien de la page de redirection (page de vente de l'utilisateur) — OBLIGATOIRE
  callToAction?: string; // bouton d'appel à l'action Meta (SHOP_NOW, LEARN_MORE…) — OBLIGATOIRE pour Meta, choisi par l'utilisateur
  storeId?: string; // boutique du produit résolu dans le chat, revérifiée côté serveur
  productId?: string;
  locale?: string;
  imageUrl?: string; // média principal : image OU vidéo (voir mediaType)
  mediaType?: string; // "image" | "video" — "video" si imageUrl est une vidéo (sinon détecté via l'URL)
  carouselUrls?: string[]; // images supplémentaires après imageUrl (Meta : carrousel de 2 à 10 cartes)
  pageId?: string;
  metaAdAccountId?: string; // id de la ligne meta_ad_accounts (compte choisi dans l'appli)
  pinterestAdAccountId?: string;
  adAccountId?: string;
  durationDays?: number;
  platform?: string; // "meta" | "pinterest" | "tiktok"
};

// Le budget est toujours traité en dollars US (devise des comptes pub) : quel que
// soit la devise donnée par l'utilisateur, on le convertit AVANT de vérifier ce
// minimum et AVANT de créer quoi que ce soit chez Meta, pour ne jamais te retrouver
// avec une campagne qui dépense réellement mais qu'on ne peut pas enregistrer.
const MIN_DAILY_BUDGET_USD = 1;

// URL du catalogue résolue par Vendeo, ou ajustement manuel dans la confirmation.
// Aucun lien générique par défaut n'est utilisé.
function normalizeLinkUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// lib/meta/campaigns.ts (utilisé par la section Pub) attend un objectif simplifié
// ("sales" | "traffic" | "engagement" | "leads"), pas les codes OUTCOME_* que
// l'IA du chat renvoie dans son JSON de lancement. OUTCOME_AWARENESS n'a pas
// d'équivalent dans ce flux (la section Pub ne le propose pas non plus, voir
// /api/ad-campaigns/route.ts) : on retombe sur "engagement".
function toSimpleObjective(objective: string | undefined): "sales" | "traffic" | "engagement" | "leads" {
  switch (objective) {
    case "OUTCOME_SALES":
      return "sales";
    case "OUTCOME_TRAFFIC":
      return "traffic";
    case "OUTCOME_LEADS":
      return "leads";
    default:
      return "engagement";
  }
}

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = (await request.json().catch(() => null)) as LaunchBody | null;
  if (!body?.name || !body.message) {
    return NextResponse.json({ error: "Nom de campagne et texte de créative requis." }, { status: 400 });
  }
  // TikTok reste disponible depuis le wizard Pub, mais l'assistant sait lancer
  // Meta et Pinterest directement avec le compte choisi dans sa confirmation.
  if (typeof body.platform === "string" && /tik\s?-?tok/i.test(body.platform)) {
    return NextResponse.json({ error: TIKTOK_FROM_CHAT_MESSAGE, code: "PLATFORM_NOT_SUPPORTED" }, { status: 400 });
  }
  if (!body.imageUrl) {
    return NextResponse.json({ error: "Ajoute une image ou une vidéo avant de lancer la campagne." }, { status: 400 });
  }
  // Lien de redirection obligatoire : vérifié AVANT tout appel Meta.
  const linkUrl = normalizeLinkUrl(body.linkUrl);
  if (!linkUrl) {
    return NextResponse.json(
      { error: "Indique le lien de ta page de redirection (ex. https://ta-page-de-vente.com) avant de lancer la campagne.", code: "LINK_URL_REQUIRED" },
      { status: 400 }
    );
  }
  // Budget : saisi par l'utilisateur dans SA devise (XOF si l'IA n'a rien précisé,
  // comme avant), converti en dollars US — c'est le montant réellement envoyé à
  // Meta/TikTok et enregistré en base (daily_budget est en dollars, comme le wizard).
  const enteredBudget = Number(body.dailyBudget ?? 0);
  const enteredCurrency = typeof body.currency === "string" && body.currency.trim() ? body.currency.trim().toUpperCase() : "XOF";
  const dailyBudget = toUsd(enteredBudget, enteredCurrency);
  if (dailyBudget === null) {
    return NextResponse.json(
      { error: `La devise « ${enteredCurrency} » n'est pas prise en charge. Indique ton budget en dollars ($), en euros ou en F CFA (XOF).`, code: "CURRENCY_UNSUPPORTED" },
      { status: 400 }
    );
  }
  if (!Number.isFinite(dailyBudget) || dailyBudget < MIN_DAILY_BUDGET_USD) {
    return NextResponse.json(
      { error: `Le budget quotidien doit être d'au moins ${MIN_DAILY_BUDGET_USD} $ (soit environ ${Math.ceil(MIN_DAILY_BUDGET_USD / (toUsd(1, enteredCurrency) || 1))} ${enteredCurrency}).` },
      { status: 400 }
    );
  }

  const selectedStore = await resolveChatCampaignStore(supabase, user.id, typeof body.storeId === "string" ? body.storeId : undefined);
  if (!selectedStore.ok) {
    const en = body.locale === "en";
    return NextResponse.json({ error: selectedStore.code === "STORE_SELECTION_REQUIRED"
      ? (en ? "Choose the product and its store in the chat before launching the campaign." : "Choisis le produit et sa boutique dans le chat avant de lancer la campagne.")
      : (en ? "The selected store was not found or is disconnected." : "La boutique sélectionnée est introuvable ou déconnectée."), code: selectedStore.code }, { status: 400 });
  }
  const store = selectedStore.store;
  if (typeof body.platform === "string" && /pinterest/i.test(body.platform)) {
    return launchPinterestFromChat({ supabase, userId: user.id, body, dailyBudget, linkUrl, store });
  }

  // Bouton d'appel à l'action (Meta) : choisi par l'utilisateur, jamais deviné. Vérifié AVANT tout appel Meta.
  const callToAction = normalizeMetaCta(body.callToAction);
  if (!callToAction) {
    return NextResponse.json(
      { error: "Choisis le bouton d'appel à l'action de ta publicité (Acheter, Commander, En savoir plus…) avant de lancer la campagne.", code: "CTA_REQUIRED" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Récupère les comptes Meta actifs, puis choisit celui à utiliser :
  // 1. le compte explicitement demandé (metaAdAccountId = id de la ligne en base),
  // 2. sinon le compte sélectionné dans l'appli (is_selected),
  // 3. sinon le compte actif le plus récent.
  const { data: accounts, error: accountError } = await admin
    .from("meta_ad_accounts")
    .select("id,meta_account_id,name,access_token_encrypted,is_selected")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (accountError || !accounts?.length) {
    return NextResponse.json({ error: "Connecte d'abord un compte Meta Ads." }, { status: 400 });
  }
  const account =
    (body.metaAdAccountId ? accounts.find((a) => a.id === body.metaAdAccountId) : undefined) ??
    accounts.find((a) => a.is_selected) ??
    accounts[0];
  if (!account) {
    return NextResponse.json({ error: "Le compte Meta Ads sélectionné est introuvable ou inactif." }, { status: 400 });
  }
  const accessToken = decryptSecret(account.access_token_encrypted);
  const accountId = `act_${(body.adAccountId || account.meta_account_id).replace(/^act_/, "")}`;

  // Objectif Ventes : l'ad set doit optimiser sur l'événement Achat (OFFSITE_CONVERSIONS + pixel +
  // PURCHASE). Sans objectif ni pixel transmis, createMetaAdSet retombe sur « Trafic »
  // (LANDING_PAGE_VIEWS = vues de la page de destination) même si la campagne est en Ventes.
  // Même choix de pixel que le wizard (/api/ad-campaigns/[id]/launch) : d'abord celui marqué
  // « configuré sur Chariow », sinon le plus récemment actif du compte pub. Sans pixel, on
  // refuse de lancer plutôt que de diffuser en silence une campagne optimisée sur les vues.
  const objective = toSimpleObjective(body.objective);
  let pixelId: string | null = null;
  if (objective === "sales") {
    const { data: accountPixels } = await supabase
      .from("meta_pixels")
      .select("pixel_id,configured_on_chariow,last_fired_at")
      .eq("user_id", user.id)
      .eq("ad_account_id", account.id)
      .order("configured_on_chariow", { ascending: false })
      .order("last_fired_at", { ascending: false, nullsFirst: false })
      .limit(1);
    pixelId = typeof accountPixels?.[0]?.pixel_id === "string" ? accountPixels[0].pixel_id : null;
    if (!pixelId) {
      return NextResponse.json(
        {
          error:
            "Aucun pixel Meta n'est connecté à ce compte publicitaire : impossible d'optimiser sur l'événement Achat. " +
            "Connecte ou installe ton pixel Meta (Chariow), puis relance la campagne — ou choisis l'objectif Trafic.",
          code: "PIXEL_REQUIRED",
        },
        { status: 400 }
      );
    }
  }

  // Vérifie AVANT de créer quoi que ce soit que le compte peut réellement publier
  // (compte actif + moyen de paiement). Même vérification, mêmes fonctions que
  // /api/ad-campaigns/[id]/launch : on renvoie la raison exacte à l'utilisateur
  // au lieu de le laisser se heurter à une erreur Meta opaque après coup.
  try {
    const funding = await getMetaAccountFunding(accountId, accessToken);
    const issue = describeMetaFundingIssue(funding);
    if (issue) {
      return NextResponse.json({ error: issue.message, code: issue.code }, { status: 400 });
    }
  } catch {
    // Si Meta est momentanément indisponible pour cette vérification, on ne bloque
    // pas : Meta refusera de toute façon la création si le compte est inéligible.
  }

  // Page Facebook : celle transmise par le client si déjà connue, sinon la
  // première page accessible sur ce compte (API Graph "me/accounts", même appel
  // que le wizard "Lancer une pub" — voir lib/meta/api.ts:fetchMetaResources).
  let pageId = body.pageId;
  if (!pageId) {
    const resources = await fetchMetaResources(accountId, accessToken);
    const firstPage = resources.pages[0] as { id?: string } | undefined;
    pageId = firstPage?.id;
    if (!pageId) {
      return NextResponse.json(
        {
          error:
            resources.pagesError ??
            "Aucune Page Facebook n'est rattachée à ce compte publicitaire dans Meta Business Manager. " +
              "Dans Business Settings → Comptes → Pages de l'entreprise qui possède ce compte publicitaire, ajoute la Page à utiliser comme actif, puis réessaie.",
        },
        { status: 400 }
      );
    }
  }

  const countries = body.countries?.length ? body.countries : ["BJ"];
  const minAge = body.ageMin ?? 18;
  const maxAge = body.ageMax ?? 65;
  const durationDays = 1;
  // Vidéo : le média principal est une vidéo (indiqué par le client, sinon détecté via l'URL).
  // Une vidéo n'est jamais combinée à un carrousel d'images.
  const mediaUrl: string = body.imageUrl;
  const isVideo = body.mediaType === "video" || isVideoMediaUrl(mediaUrl);
  // Carrousel : images supplémentaires (https, sans doublon, 9 au plus) après l'image principale.
  // Aucune image supplémentaire = publicité à image unique, comme avant.
  const carouselExtraUrls = isVideo ? [] : parseCarouselUrls(body.carouselUrls, body.imageUrl);

  // Vidéo : envoyée à Meta et traitée AVANT de créer la campagne. Si Meta refuse la vidéo
  // ou met trop de temps à la traiter, rien n'a encore été créé chez Meta (pas de campagne orpheline).
  let video: { videoId: string; thumbnailUrl: string } | null = null;
  if (isVideo) {
    try {
      video = await prepareMetaCreativeVideo({ accountId, accessToken, videoUrl: mediaUrl, name: body.name });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible d'envoyer la vidéo à Meta.";
      console.error("launch-campaign Meta error (étape vidéo)", message);
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // 1. Campagne. Si CETTE étape échoue, rien n'a été créé côté Meta : l'erreur
  // Graph est déjà claire, on peut la laisser remonter telle quelle.
  const vendeoCampaignId = randomUUID();
  const trackedLinkUrl = withVendeoCampaignTracking(linkUrl, vendeoCampaignId);
  let campaignId: string | undefined;
  try {
    const campaign = await createMetaCampaign({ accountId, accessToken, name: body.name, objective, dailyBudget, status: "ACTIVE" });
    campaignId = campaign.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de lancement Meta.";
    console.error("launch-campaign Meta error (étape campagne)", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // 2 à 4. Ad set → créative → ad, puis enregistrement en base. À partir d'ici
  // une campagne existe réellement sur le compte Meta : si une de ces étapes
  // échoue — création Meta OU enregistrement Vendeo — on supprime la campagne
  // chez Meta avant de renvoyer l'erreur, pour ne jamais laisser une campagne
  // qui dépense réellement sans trace côté Vendeo.
  try {
    const adSet = await createMetaAdSet({
      accountId,
      accessToken,
      campaignId,
      name: `${body.name} — Ensemble`,
      dailyBudget,
      countries,
      minAge,
      maxAge,
      // Optimisation de l'ad set : Ventes = événement Achat du pixel ; sinon l'objectif choisi.
      objective,
      pixelId: objective === "sales" ? pixelId : null,
      status: "ACTIVE",
    });
    const adSetId = String(adSet.id);

    // Advantage+ créative activé : retouches visuelles, améliorations du texte et
    // superpositions (recommandation du Score d'opportunité de Meta).
    // L'image est envoyée à Meta par Vendeo (image_hash) : une URL signée de notre stockage privé
    // n'est pas toujours téléchargeable par Meta (« Image non téléchargée »). Repli sur l'URL si l'envoi échoue.
    // Carrousel : chaque carte est envoyée à Meta de la même façon (une image_hash par carte) ;
    // les améliorations Advantage+ ne s'appliquent qu'à l'image unique.
    // Vidéo : créative video_data (la vidéo a déjà été envoyée et traitée plus haut), sans Advantage+.
    // Dans les trois cas, le bouton d'appel à l'action choisi par l'utilisateur est transmis à la créative.
    let creative: { id?: unknown };
    if (video) {
      creative = await createMetaVideoCreative({
        accountId,
        accessToken,
        name: `${body.name} — Créative`,
        pageId,
        link: trackedLinkUrl,
        message: body.message,
        headline: body.headline || body.name,
        videoId: video.videoId,
        thumbnailUrl: video.thumbnailUrl,
        callToAction,
      });
    } else if (carouselExtraUrls.length >= 1) {
      const cards = await Promise.all(
        [body.imageUrl, ...carouselExtraUrls].map(async (url) => ({
          url,
          hash: (await prepareMetaCreativeImage({ userId: user.id, accountId, accessToken, imageUrl: url })).imageHash,
        }))
      );
      creative = await createMetaCarouselCreative({
        accountId,
        accessToken,
        name: `${body.name} — Créative`,
        pageId,
        link: trackedLinkUrl,
        message: body.message,
        headline: body.headline || body.name,
        cards,
        callToAction,
      });
    } else {
      const { imageHash } = await prepareMetaCreativeImage({ userId: user.id, accountId, accessToken, imageUrl: body.imageUrl });
      creative = await createMetaCreative({
        accountId,
        accessToken,
        name: `${body.name} — Créative`,
        pageId,
        link: trackedLinkUrl,
        message: body.message,
        headline: body.headline || body.name,
        imageUrl: body.imageUrl,
        imageHash,
        advantageCreative: true,
        callToAction,
      });
    }
    const creativeId = String(creative.id);

    // Image : annonce créée en PAUSED, aperçu des fonctions Advantage+, puis activée
    // (parcours exigé par Meta quand une fonction générée par IA est activée).
    // Vidéo : pas de fonction Advantage+ créative, l'annonce est créée directement ACTIVE.
    const ad = video
      ? await createMetaAd({ accountId, accessToken, name: `${body.name} — Pub`, adsetId: adSetId, creativeId, status: "ACTIVE" })
      : await publishMetaAdWithAdvantage({ accountId, accessToken, name: `${body.name} — Pub`, adsetId: adSetId, creativeId });
    const adId = String(ad.id);

    // Enregistre la campagne pour qu'elle apparaisse dans la page Pub.
    // store_id/estimated_budget sont "not null" en base (voir
    // 20260830180000_ad_campaign_drafts.sql) : on vérifie explicitement
    // l'erreur — une campagne créée chez Meta mais jamais enregistrée ici est
    // pire qu'une erreur affichée à l'utilisateur, elle est invisible.
    const { error: insertError } = await admin.from("ad_campaigns").insert({
      id: vendeoCampaignId,
      user_id: user.id,
      store_id: store.id,
      platform: "meta",
      status: "review",
      objective,
      effective_objective: objective,
      title: body.name,
      ad_text: body.message,
      media_url: body.imageUrl,
      carousel_urls: carouselExtraUrls.length ? carouselExtraUrls : null,
      destination_url: trackedLinkUrl,
      call_to_action: callToAction,
      countries,
      min_age: minAge,
      max_age: maxAge,
      daily_budget: dailyBudget,
      duration_days: durationDays,
      estimated_budget: dailyBudget * durationDays,
      meta_ad_account_id: account.id,
      meta_page_id: pageId,
      external_campaign_id: campaignId,
      external_adset_id: adSetId,
      external_creative_id: creativeId,
      external_ad_id: adId,
    });
    if (insertError) throw new Error(`Campagne créée chez Meta mais non enregistrée côté Vendeo (${insertError.message}).`);

    return NextResponse.json({ campaignId, adSetId, creativeId, adId, dailyBudgetUsd: dailyBudget, callToAction, carouselCards: carouselExtraUrls.length ? carouselExtraUrls.length + 1 : 1 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de lancement Meta.";
    console.error("launch-campaign Meta error (après création de la campagne)", message, { campaignId });

    // Filet de sécurité : que l'échec vienne de Meta (ad set/créative/ad) ou de
    // l'enregistrement Vendeo, on supprime la campagne créée à l'étape 1 pour
    // éviter qu'elle continue à dépenser sans être suivie. Best-effort : si la
    // suppression échoue à son tour, on ne masque jamais l'erreur d'origine
    // avec celle du rollback — on la log seulement.
    try {
      await deleteMetaCampaign({ campaignId, accessToken });
    } catch (cleanupError) {
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : "Erreur inconnue lors du nettoyage.";
      console.error("launch-campaign: échec du rollback de la campagne fantôme", { campaignId, cleanupMessage });
    }

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function launchPinterestFromChat({ supabase, userId, body, dailyBudget, linkUrl, store }: { supabase: any; userId: string; body: LaunchBody; dailyBudget: number; linkUrl: string; store: { id: string } }) {
  const { data: accounts, error: accountError } = await supabase.from("pinterest_ad_accounts").select("id,pinterest_ad_account_id,pinterest_integration_id,is_active").eq("user_id", userId).eq("is_active", true);
  if (accountError || !accounts?.length) return NextResponse.json({ error: "Connecte d'abord un compte Pinterest Ads." }, { status: 400 });
  const account = (body.pinterestAdAccountId ? accounts.find((item: any) => item.id === body.pinterestAdAccountId) : undefined) ?? accounts[0];
  if (!account) return NextResponse.json({ error: "Le compte Pinterest Ads sélectionné est introuvable ou inactif." }, { status: 400 });
  const { data: integration } = await supabase.from("pinterest_integrations").select("access_token_encrypted").eq("id", account.pinterest_integration_id).eq("user_id", userId).maybeSingle();
  if (!integration) return NextResponse.json({ error: "Intégration Pinterest introuvable. Reconnecte Pinterest puis réessaie." }, { status: 400 });

  const durationDays = Number.isFinite(Number(body.durationDays)) && Number(body.durationDays) > 0 ? Math.min(365, Math.round(Number(body.durationDays))) : 1;
  const objective = toSimpleObjective(body.objective);
  const campaignName = body.name || "Campagne Pinterest";
  try {
    const external = await launchPinterest({ adAccountId: account.pinterest_ad_account_id, accessToken: decryptSecret(integration.access_token_encrypted), name: campaignName, adText: body.message || "", title: body.headline || campaignName, link: linkUrl, mediaUrl: body.imageUrl || "", dailyBudget, durationDays, minAge: body.ageMin ?? 18, maxAge: body.ageMax ?? 65, countries: body.countries?.length ? body.countries : ["BJ"], objective });
    const admin = createAdminClient();
    const { error: insertError } = await admin.from("ad_campaigns").insert({ user_id: userId, store_id: store.id, platform: "pinterest", status: "review", objective, title: campaignName, ad_text: body.message || "", media_url: body.imageUrl, destination_url: linkUrl, countries: body.countries?.length ? body.countries : ["BJ"], min_age: body.ageMin ?? 18, max_age: body.ageMax ?? 65, daily_budget: dailyBudget, duration_days: durationDays, estimated_budget: dailyBudget * durationDays, pinterest_ad_account_id: account.id, external_campaign_id: external.campaignId, external_adset_id: external.adGroupId, external_creative_id: external.pinId, external_ad_id: external.adId });
    if (insertError) return NextResponse.json({ error: `Campagne Pinterest créée mais non enregistrée côté Vendeo (${insertError.message}).` }, { status: 502 });
    return NextResponse.json({ campaignId: external.campaignId, dailyBudgetUsd: dailyBudget, platform: "pinterest" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de lancement Pinterest.";
    // Objectif Ventes refusé faute de balise Pinterest : jamais de repli Trafic automatique depuis le chat.
    if (objective === "sales" && isPinterestConversionTagError(message)) {
      return NextResponse.json({ error: pinterestTagChatMessage(), code: PINTEREST_TAG_REQUIRED_CODE }, { status: 409 });
    }
    return NextResponse.json({ error: `Pinterest n’a pas accepté la campagne : ${message}` }, { status: 502 });
  }
}
