import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { toUsd } from "@/lib/currency";
import { createMetaCampaign, createMetaAdSet, createMetaCreative, publishMetaAdWithAdvantage, deleteMetaCampaign } from "@/lib/meta/campaigns";
import { fetchMetaResources, getMetaAccountFunding, describeMetaFundingIssue } from "@/lib/meta/api";
import { prepareMetaCreativeImage } from "@/lib/meta/ad-image";
import { launchPinterest } from "@/lib/pinterest/api";
import { TIKTOK_FROM_CHAT_MESSAGE } from "@/lib/launch-platform";

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
  imageUrl?: string;
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

// Chaque utilisateur a sa propre page de vente : il n'existe AUCUN lien par défaut.
// On n'accepte qu'une URL http(s) valide, fournie par l'utilisateur.
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

  if (typeof body.platform === "string" && /pinterest/i.test(body.platform)) {
    return launchPinterestFromChat({ supabase, userId: user.id, body, dailyBudget, linkUrl });
  }

  const admin = createAdminClient();

  // La campagne doit être rattachée à une boutique Chariow connectée pour
  // apparaître dans "Mes campagnes" (même exigence que /api/ad-campaigns,
  // utilisée par le wizard "Lancer une pub") — sans ça, l'insertion plus bas
  // échoue (store_id est "not null" en base) et la campagne, déjà créée et
  // active chez Meta à ce moment-là, resterait invisible côté Vendeo.
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", user.id)
    .eq("connection_status", "connected")
    .limit(1)
    .maybeSingle();
  if (storeError || !store) {
    return NextResponse.json({ error: "Connecte d'abord une boutique Chariow." }, { status: 400 });
  }

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

  const objective = toSimpleObjective(body.objective);
  const countries = body.countries?.length ? body.countries : ["BJ"];
  const minAge = body.ageMin ?? 18;
  const maxAge = body.ageMax ?? 65;
  const durationDays = 1;

  // 1. Campagne. Si CETTE étape échoue, rien n'a été créé côté Meta : l'erreur
  // Graph est déjà claire, on peut la laisser remonter telle quelle.
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
      status: "ACTIVE",
    });
    const adSetId = String(adSet.id);

    // Advantage+ créative activé : retouches visuelles, améliorations du texte et
    // superpositions (recommandation du Score d'opportunité de Meta).
    // L'image est envoyée à Meta par Vendeo (image_hash) : une URL signée de notre stockage privé
    // n'est pas toujours téléchargeable par Meta (« Image non téléchargée »). Repli sur l'URL si l'envoi échoue.
    const { imageHash } = await prepareMetaCreativeImage({ userId: user.id, accountId, accessToken, imageUrl: body.imageUrl });
    const creative = await createMetaCreative({
      accountId,
      accessToken,
      name: `${body.name} — Créative`,
      pageId,
      link: linkUrl,
      message: body.message,
      headline: body.headline || body.name,
      imageUrl: body.imageUrl,
      imageHash,
      advantageCreative: true,
    });
    const creativeId = String(creative.id);

    // Annonce créée en PAUSED, aperçu des fonctions Advantage+, puis activée
    // (parcours exigé par Meta quand une fonction générée par IA est activée).
    const ad = await publishMetaAdWithAdvantage({ accountId, accessToken, name: `${body.name} — Pub`, adsetId: adSetId, creativeId });
    const adId = String(ad.id);

    // Enregistre la campagne pour qu'elle apparaisse dans la page Pub.
    // store_id/estimated_budget sont "not null" en base (voir
    // 20260830180000_ad_campaign_drafts.sql) : on vérifie explicitement
    // l'erreur — une campagne créée chez Meta mais jamais enregistrée ici est
    // pire qu'une erreur affichée à l'utilisateur, elle est invisible.
    const { error: insertError } = await admin.from("ad_campaigns").insert({
      user_id: user.id,
      store_id: store.id,
      platform: "meta",
      status: "review",
      objective,
      title: body.name,
      ad_text: body.message,
      media_url: body.imageUrl,
      destination_url: linkUrl,
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

    return NextResponse.json({ campaignId, adSetId, creativeId, adId, dailyBudgetUsd: dailyBudget });
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

async function launchPinterestFromChat({ supabase, userId, body, dailyBudget, linkUrl }: { supabase: any; userId: string; body: LaunchBody; dailyBudget: number; linkUrl: string }) {
  const { data: store, error: storeError } = await supabase.from("stores").select("id").eq("user_id", userId).eq("connection_status", "connected").limit(1).maybeSingle();
  if (storeError || !store) return NextResponse.json({ error: "Connecte d'abord une boutique Chariow." }, { status: 400 });
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
    return NextResponse.json({ error: `Pinterest n’a pas accepté la campagne : ${message}` }, { status: 502 });
  }
}
