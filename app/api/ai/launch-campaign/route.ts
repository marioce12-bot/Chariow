import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { MetaAdsMcpClient, createMetaCampaign, createMetaAdSet, createMetaCreative, createMetaAd } from "@/lib/meta/mcp";

// Lance une campagne Meta complète via le serveur MCP, à partir d'un brief validé
// par l'utilisateur dans l'assistant. Flux : campagne → ad set → creative → ad.
type LaunchBody = {
  name?: string;
  objective?: string;
  dailyBudget?: number; // en XOF (converti en centimes côté serveur)
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

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const body = (await request.json().catch(() => null)) as LaunchBody | null;
  if (!body?.name || !body.message) {
    return NextResponse.json({ error: "Nom de campagne et texte de créative requis." }, { status: 400 });
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
  const adAccountId = body.adAccountId || account.meta_account_id.replace(/^act_/, "");

  const client = new MetaAdsMcpClient(accessToken);

  try {
    // 1. Campagne.
    const campaign = (await createMetaCampaign(accessToken, {
      adAccountId,
      name: body.name,
      objective: body.objective ?? "OUTCOME_SALES",
      ...(body.dailyBudget ? { dailyBudgetCents: Math.round(body.dailyBudget * 100) } : {}),
    })) as { campaign_id?: string; id?: string };
    const campaignId = campaign.campaign_id ?? campaign.id;
    if (!campaignId) throw new Error("Meta n'a pas renvoyé l'identifiant de campagne.");

    // 2. Page Facebook (nécessaire pour la créative).
    let pageId = body.pageId;
    if (!pageId) {
      const pages = (await client.callTool("ads_get_ad_account_pages", { ad_account_id: adAccountId })) as { pages?: Array<{ id?: string }> };
      pageId = pages?.pages?.[0]?.id;
    }
    if (!pageId) throw new Error("Aucune Page Facebook disponible pour ce compte publicitaire.");

    // 3. Ensemble de publicités (audience + âge).
    const adSet = (await createMetaAdSet(accessToken, {
      adAccountId,
      campaignId,
      name: `${body.name} — Ensemble`,
      optimizationGoal: "OFFSITE_CONVERSIONS",
      billingEvent: "IMPRESSIONS",
      countries: body.countries?.length ? body.countries : undefined,
      ageMin: body.ageMin,
      ageMax: body.ageMax,
      ...(body.dailyBudget ? { dailyBudgetCents: Math.round(body.dailyBudget * 100) } : {}),
    })) as { ad_set_id?: string; id?: string };
    const adSetId = adSet.ad_set_id ?? adSet.id;
    if (!adSetId) throw new Error("Meta n'a pas renvoyé l'identifiant d'ensemble.");

    // 4. Créative.
    const creative = (await createMetaCreative(accessToken, {
      adAccountId,
      pageId,
      imageUrl: body.imageUrl,
      message: body.message,
      headline: body.headline,
      linkUrl: body.linkUrl ?? "https://vendeo-studio.site",
      callToActionType: "SHOP_NOW",
      name: `${body.name} — Créative`,
    })) as { creative_id?: string; id?: string };
    const creativeId = creative.creative_id ?? creative.id;
    if (!creativeId) throw new Error("Meta n'a pas renvoyé l'identifiant de créative.");

    // 5. Publicité.
    const ad = (await createMetaAd(accessToken, { adAccountId, adSetId, name: `${body.name} — Pub`, creativeId })) as { ad_id?: string; id?: string };

    // Enregistre la campagne pour qu'elle apparaisse dans la page Pub.
    await admin.from("ad_campaigns").insert({
      user_id: user.id,
      platform: "meta",
      status: "review",
      objective: body.objective ?? "OUTCOME_SALES",
      title: body.name,
      ad_text: body.message,
      media_url: body.imageUrl ?? null,
      destination_url: body.linkUrl ?? "https://vendeo-studio.site",
      countries: body.countries ?? null,
      min_age: body.ageMin ?? null,
      max_age: body.ageMax ?? null,
      daily_budget: body.dailyBudget ?? null,
      duration_days: 1,
      meta_ad_account_id: account.id,
      external_campaign_id: campaignId,
    });

    return NextResponse.json({ campaignId, adSetId, creativeId, adId: ad.ad_id ?? ad.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur de lancement via MCP.";
    console.error("launch-campaign MCP error", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
