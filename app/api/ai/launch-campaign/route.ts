import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { createMetaCampaign, createMetaAdSet, createMetaCreative, createMetaAd, deleteMetaCampaign } from "@/lib/meta/campaigns";
import { fetchMetaResources, getMetaAccountFunding, describeMetaFundingIssue } from "@/lib/meta/api";

// Lance une campagne Meta complète via l'API Marketing directe (même chemin que
// /api/ad-campaigns/[id]/launch), à partir d'un brief validé par l'utilisateur
// dans l'assistant IA. Flux : campagne → ad set → creative → ad, toutes créées
// directement en ACTIVE — pas de passage par le serveur MCP publicités de Meta.
type LaunchBody = {
  name?: string;
  objective?: string; // OUTCOME_SALES | OUTCOME_TRAFFIC | OUTCOME_ENGAGEMENT | OUTCOME_LEADS | OUTCOME_AWARENESS
  dailyBudget?: number; // en XOF
  countries?: string[];
  ageMin?: number;
  ageMax?: number;
  message?: string; // texte de la créative
  headline?: string;
  linkUrl?: string;
  imageUrl?: string;
  pageId?: string;
  metaAdAccountId?: string; // id de la ligne meta_ad_accounts (compte choisi dans l'appli)
  adAccountId?: string;
};

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
  if (!body.imageUrl) {
    return NextResponse.json({ error: "Ajoute une image ou une vidéo avant de lancer la campagne." }, { status: 400 });
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
  const dailyBudget = body.dailyBudget ?? 0;
  const countries = body.countries?.length ? body.countries : ["BJ"];
  const linkUrl = body.linkUrl ?? "https://vendeo-studio.site";

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

  // 2 à 4. Ad set → créative → ad. À partir d'ici une campagne existe réellement
  // sur le compte Meta : si une de ces étapes échoue, on la supprime avant de
  // renvoyer l'erreur, pour ne pas laisser de campagne fantôme vide.
  try {
    const adSet = await createMetaAdSet({
      accountId,
      accessToken,
      campaignId,
      name: `${body.name} — Ensemble`,
      dailyBudget,
      countries,
      minAge: body.ageMin ?? 18,
      maxAge: body.ageMax ?? 65,
      status: "ACTIVE",
    });
    const adSetId = String(adSet.id);

    const creative = await createMetaCreative({
      accountId,
      accessToken,
      name: `${body.name} — Créative`,
      pageId,
      link: linkUrl,
      message: body.message,
      headline: body.headline || body.name,
      imageUrl: body.imageUrl,
    });
    const creativeId = String(creative.id);

    const ad = await createMetaAd({ accountId, accessToken, name: `${body.name} — Pub`, adsetId: adSetId, creativeId, status: "ACTIVE" });
    const adId = String(ad.id);

    // Enregistre la campagne pour qu'elle apparaisse dans la page Pub.
    await admin.from("ad_campaigns").insert({
      user_id: user.id,
      platform: "meta",
      status: "review",
      objective,
      title: body.name,
      ad_text: body.message,
      media_url: body.imageUrl,
      destination_url: linkUrl,
      countries,
      min_age: body.ageMin ?? null,
      max_age: body.ageMax ?? null,
      daily_budget: dailyBudget || null,
      duration_days: 1,
      meta_ad_account_id: account.id,
      meta_page_id: pageId,
      external_campaign_id: campaignId,
      external_adset_id: adSetId,
      external_creative_id: creativeId,
      external_ad_id: adId,
    });

    return NextResponse.json({ campaignId, adSetId, creativeId, adId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de lancement Meta.";
    console.error("launch-campaign Meta error (après création de la campagne)", message, { campaignId });

    // Filet de sécurité : la campagne créée à l'étape 1 est vide et inutile côté
    // Meta, on la supprime pour éviter d'accumuler des campagnes fantômes. Cette
    // suppression est best-effort : si elle échoue à son tour, on ne masque
    // jamais l'erreur d'origine avec celle du rollback — on la log seulement.
    try {
      await deleteMetaCampaign({ campaignId, accessToken });
    } catch (cleanupError) {
      const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : "Erreur inconnue lors du nettoyage.";
      console.error("launch-campaign: échec du rollback de la campagne fantôme", { campaignId, cleanupMessage });
    }

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
