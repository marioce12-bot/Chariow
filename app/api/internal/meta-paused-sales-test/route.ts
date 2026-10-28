import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { createMetaAdSet, createMetaCampaign } from "@/lib/meta/campaigns";
import { fetchMetaAccountStatus, isMetaAccountStatusBlocking } from "@/lib/meta/api";
import {
  getMetaGrantedPermissions,
  readMetaPausedTestAdSet,
  readMetaPausedTestCampaign,
  readMetaPausedTestObjectStatus,
  type MetaPausedObjectState,
} from "@/lib/meta/paused-sales-website-test";

const CONFIRMATION = "CREATE_PAUSED_SALES_WEBSITE_TEST_NO_AD";
const ONE_USE_CLAIM_KEY = "meta-paused-sales-whatsapp-status-preview-v1";
const MAX_TEST_DAILY_BUDGET = 5;
const PAUSED_EFFECTIVE_STATUSES = new Set(["PAUSED", "CAMPAIGN_PAUSED", "ADSET_PAUSED"]);

type JsonBody = Record<string, unknown>;

function reply(body: JsonBody, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function isPaused(state: MetaPausedObjectState) {
  return state.status === "PAUSED" && PAUSED_EFFECTIVE_STATUSES.has(state.effectiveStatus);
}

function isExactSet(actual: string[], expected: string[]) {
  const values = new Set(actual);
  return actual.length === expected.length && values.size === expected.length && expected.every((value) => values.has(value));
}

function assertPaused(state: MetaPausedObjectState, label: string) {
  if (!isPaused(state)) throw new Error(`Meta n’a pas confirmé ${label} strictement en PAUSED`);
}

export async function POST(request: Request) {
  // Preview only, separately enabled and pinned to one Vendeo user; never available in Production.
  const allowedUserId = process.env.META_PAUSED_SALES_TEST_USER_ID;
  if (process.env.VERCEL_ENV !== "preview" || process.env.META_PAUSED_SALES_TEST_ENABLED !== "true" || !allowedUserId) {
    return reply({ error: "Route de test indisponible" }, 404);
  }

  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  if (user.id !== allowedUserId) return reply({ error: "Accès refusé" }, 403);

  const body = await request.json().catch(() => null) as JsonBody | null;
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Requête invalide" }, 400);
  const allowedFields = new Set(["confirmation", "meta_ad_account_row_id", "daily_budget", "country"]);
  if (Object.keys(body).some((key) => !allowedFields.has(key))) return reply({ error: "Paramètre non autorisé" }, 400);
  if (body.confirmation !== CONFIRMATION) return reply({ error: "Confirmation explicite du test PAUSED requise" }, 400);

  const accountRowId = typeof body.meta_ad_account_row_id === "string" ? body.meta_ad_account_row_id.trim() : "";
  const dailyBudget = typeof body.daily_budget === "number" ? body.daily_budget : Number.NaN;
  const country = typeof body.country === "string" ? body.country.trim().toUpperCase() : "";
  if (!accountRowId || !Number.isFinite(dailyBudget) || dailyBudget < 1 || dailyBudget > MAX_TEST_DAILY_BUDGET || !/^[A-Z]{2}$/.test(country)) {
    return reply({ error: `Paramètres invalides : budget entre 1 et ${MAX_TEST_DAILY_BUDGET} unités de devise, compte et pays requis` }, 400);
  }

  const { data: account, error: accountError } = await supabase.from("meta_ad_accounts")
    .select("id,meta_account_id,access_token_encrypted,is_active")
    .eq("id", accountRowId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (accountError) return reply({ error: "Impossible de vérifier le compte Meta. Aucune création." }, 500);
  if (!account?.is_active || typeof account.meta_account_id !== "string" || typeof account.access_token_encrypted !== "string") {
    return reply({ error: "Compte Meta actif et connecté requis. Aucune création." }, 409);
  }

  const { data: pixels, error: pixelError } = await supabase.from("meta_pixels")
    .select("pixel_id,configured_on_chariow,last_fired_at")
    .eq("user_id", user.id)
    .eq("ad_account_id", account.id)
    .order("configured_on_chariow", { ascending: false })
    .order("last_fired_at", { ascending: false, nullsFirst: false })
    .limit(1);
  if (pixelError) return reply({ error: "Impossible de vérifier le pixel Meta. Aucune création." }, 500);
  const pixelId = typeof pixels?.[0]?.pixel_id === "string" ? pixels[0].pixel_id : "";
  if (!pixelId) return reply({ error: "Un pixel Meta lié au compte est requis pour Sales. Aucune création." }, 409);

  let accessToken: string;
  try {
    accessToken = decryptSecret(account.access_token_encrypted);
  } catch {
    return reply({ error: "Identifiants Meta indisponibles. Aucune création." }, 403);
  }
  const graphAccountId = account.meta_account_id.startsWith("act_") ? account.meta_account_id : `act_${account.meta_account_id}`;

  try {
    const permissions = await getMetaGrantedPermissions(accessToken);
    if (!permissions.has("ads_management") || !permissions.has("ads_read")) {
      return reply({ error: "Permissions Meta ads_management et ads_read requises. Aucune création." }, 403);
    }
    const accountStatus = await fetchMetaAccountStatus(graphAccountId, accessToken);
    if (isMetaAccountStatusBlocking(accountStatus)) {
      return reply({ error: "Le compte publicitaire Meta n’est pas dans un état autorisant le test. Aucune création." }, 409);
    }
  } catch {
    return reply({ error: "Permissions ou accès Meta non vérifiables. Aucune création." }, 403);
  }

  // The unique database key is the one-shot gate. Never clear it on failure: the
  // Meta request may have succeeded even if its response was lost. Only the
  // already-allowlisted server request uses the service-role client here.
  try {
    const { error: claimError } = await createAdminClient().from("meta_paused_sales_test_claims").insert({ test_key: ONE_USE_CLAIM_KEY, user_id: user.id });
    if (claimError?.code === "23505") return reply({ error: "Ce test à usage unique a déjà été réclamé. Aucune nouvelle création." }, 409);
    if (claimError) {
      console.error("Paused Meta test one-use claim unavailable", { code: claimError.code });
      return reply({ error: "Verrou à usage unique indisponible. Aucune création." }, 503);
    }
  } catch {
    return reply({ error: "Verrou à usage unique indisponible. Aucune création." }, 503);
  }

  let campaignId: string | null = null;
  let adSetId: string | null = null;
  let campaignState: MetaPausedObjectState | null = null;
  let adSetState: MetaPausedObjectState | null = null;

  try {
    const campaign = await createMetaCampaign({
      accountId: graphAccountId,
      accessToken,
      name: `Vendeo PAUSED Sales website test ${new Date().toISOString()}`,
      objective: "sales",
      dailyBudget,
      status: "PAUSED",
    });
    campaignId = String(campaign.id ?? "");
    if (!campaignId) throw new Error("Meta n’a pas renvoyé l’identifiant de la campagne");

    // Do not create the ad set until Meta has independently confirmed the campaign is PAUSED.
    const campaignBeforeAdSet = await readMetaPausedTestCampaign(campaignId, accessToken);
    campaignState = campaignBeforeAdSet;
    assertPaused(campaignBeforeAdSet, "la campagne");
    if (campaignBeforeAdSet.objective !== "OUTCOME_SALES") throw new Error("Meta n’a pas confirmé OUTCOME_SALES");

    const adSet = await createMetaAdSet({
      accountId: graphAccountId,
      accessToken,
      campaignId,
      name: `Vendeo PAUSED Sales website test audience ${new Date().toISOString()}`,
      dailyBudget,
      countries: [country],
      minAge: 18,
      maxAge: 65,
      objective: "sales",
      pixelId,
      status: "PAUSED",
      deferPostCreateValidation: true,
      publisherPlatforms: ["instagram", "whatsapp"],
      whatsappStatusTestPlacement: true,
    });
    adSetId = String(adSet.id ?? "");
    if (!adSetId) throw new Error("Meta n’a pas renvoyé l’identifiant de l’ad set");

    // Read back the full configuration; missing fields, wrong destination or goal stop the test.
    const adSetResult = await readMetaPausedTestAdSet(adSetId, accessToken);
    adSetState = adSetResult;
    assertPaused(adSetResult, "l’ad set");
    if (adSetResult.optimizationGoal !== "OFFSITE_CONVERSIONS" || adSetResult.destinationType !== "WEBSITE" || adSetResult.customEventType !== "PURCHASE") {
      throw new Error("Meta n’a pas confirmé OFFSITE_CONVERSIONS + WEBSITE + PURCHASE");
    }
    if (!isExactSet(adSetResult.publisherPlatforms, ["instagram", "whatsapp"]) || !isExactSet(adSetResult.whatsappPositions, ["status"]) || !isExactSet(adSetResult.instagramPositions, ["story"]) || adSetResult.userAgeUnknown !== false) {
      throw new Error("Meta n’a pas confirmé le ciblage exact WhatsApp Status + Instagram Stories");
    }
    const campaignAfterAdSet = await readMetaPausedTestCampaign(campaignId, accessToken);
    campaignState = campaignAfterAdSet;
    assertPaused(campaignAfterAdSet, "la campagne après lecture de l’ad set");
    if (campaignAfterAdSet.objective !== "OUTCOME_SALES") throw new Error("Meta n’a pas confirmé OUTCOME_SALES après lecture de l’ad set");

    // Final state check after reading the result, immediately before returning it.
    const [campaignFinal, adSetFinal] = await Promise.all([
      readMetaPausedTestObjectStatus(campaignId, accessToken),
      readMetaPausedTestObjectStatus(adSetId, accessToken),
    ]);
    campaignState = campaignFinal;
    adSetState = adSetFinal;
    assertPaused(campaignFinal, "la campagne à la vérification finale");
    assertPaused(adSetFinal, "l’ad set à la vérification finale");

    return reply({
      verified: true,
      ad_created: false,
      campaign: { id: campaignId, objective: campaignAfterAdSet.objective, status: campaignFinal.status, effective_status: campaignFinal.effectiveStatus },
      ad_set: { id: adSetId, status: adSetFinal.status, effective_status: adSetFinal.effectiveStatus, optimization_goal: adSetResult.optimizationGoal, destination_type: adSetResult.destinationType, custom_event_type: adSetResult.customEventType, publisher_platforms: adSetResult.publisherPlatforms, whatsapp_positions: adSetResult.whatsappPositions, instagram_positions: adSetResult.instagramPositions, user_age_unknown: adSetResult.userAgeUnknown },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "État Meta impossible à confirmer";
    console.error("Paused Meta Sales website test stopped", { campaignId, adSetId, message });
    return reply({
      error: `Test interrompu : ${message}`,
      verified: false,
      ad_created: false,
      campaign: campaignId ? { id: campaignId, last_observed_status: campaignState?.status ?? "unknown", last_observed_effective_status: campaignState?.effectiveStatus ?? "unknown", current_state_verified: false } : null,
      ad_set: adSetId ? { id: adSetId, last_observed_status: adSetState?.status ?? "unknown", last_observed_effective_status: adSetState?.effectiveStatus ?? "unknown", current_state_verified: false } : null,
    }, 502);
  }
}
