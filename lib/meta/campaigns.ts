import { META_GRAPH_BASE_URL } from "./api";

type GraphResponse = Record<string, unknown>;

async function graphPost(path: string, accessToken: string, params: Record<string, string>) {
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const response = await fetch(`${META_GRAPH_BASE_URL}/${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  const json = await response.json().catch(() => ({})) as GraphResponse;
  if (!response.ok || (typeof json.id !== "string" && json.success !== true)) {
    const message = typeof (json.error as GraphResponse | undefined)?.message === "string" ? String((json.error as GraphResponse).message) : `Meta request failed (${response.status})`;
    throw new Error(message);
  }
  return json;
}

async function graphGet(path: string, accessToken: string, fields: string) {
  const url = new URL(`${META_GRAPH_BASE_URL}/${path}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);
  const response = await fetch(url.toString(), { cache: "no-store" });
  const json = await response.json().catch(() => ({})) as GraphResponse;
  if (!response.ok) {
    const message = typeof (json.error as GraphResponse | undefined)?.message === "string" ? String((json.error as GraphResponse).message) : `Meta request failed (${response.status})`;
    throw new Error(message);
  }
  return json;
}

export async function createMetaCampaign(input: {
  accountId: string;
  accessToken: string;
  name: string;
  objective: "sales" | "traffic" | "engagement" | "leads";
  dailyBudget: number;
  status?: "ACTIVE" | "PAUSED";
}) {
  // Meta keeps its objective names separate from the simpler Vendeo labels.
  const objective = input.objective === "sales" ? "OUTCOME_SALES" : input.objective === "traffic" ? "OUTCOME_TRAFFIC" : input.objective === "leads" ? "OUTCOME_LEADS" : "OUTCOME_ENGAGEMENT";
  const campaign = await graphPost(`${input.accountId}/campaigns`, input.accessToken, {
    name: input.name.slice(0, 200),
    objective,
    // PAUSED par défaut : on crée d'abord la campagne (et l'adset/l'ad qui suivent)
    // sans jamais dépenser un centime, pour vérifier que Meta accepte bien la
    // création avant de demander le paiement. C'est seulement au moment
    // d'activateMetaCampaign() (après paiement confirmé) que le statut passe à
    // ACTIVE — c'est ce basculement, et lui seul, qui soumet la campagne à la
    // modération de Meta et démarre la diffusion.
    status: input.status ?? "PAUSED",
    special_ad_categories: "[]",
  });
  return { id: String(campaign.id), objective };
}

export async function createMetaAdSet(input: { accountId: string; accessToken: string; campaignId: string; name: string; dailyBudget: number; countries: string[]; minAge: number; maxAge: number; publisherPlatforms?: string[]; status?: "ACTIVE" | "PAUSED" }) {
  const targeting: Record<string, unknown> = { geo_locations: { countries: input.countries }, age_min: input.minAge, age_max: input.maxAge };
  // Plan Éco : diffusion restreinte à Facebook uniquement (pas Instagram).
  // Sans ce champ, Meta diffuse automatiquement sur tous les emplacements disponibles.
  if (input.publisherPlatforms?.length) targeting.publisher_platforms = input.publisherPlatforms;
  return graphPost(`${input.accountId}/adsets`, input.accessToken, {
    name: input.name.slice(0, 200),
    campaign_id: input.campaignId,
    daily_budget: String(Math.round(input.dailyBudget * 100)),
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: JSON.stringify(targeting),
    status: input.status ?? "PAUSED",
  });
}

export async function createMetaCreative(input: { accountId: string; accessToken: string; name: string; pageId: string; link: string; message: string; headline: string; imageUrl: string }) {
  return graphPost(`${input.accountId}/adcreatives`, input.accessToken, {
    name: input.name.slice(0, 200),
    object_story_spec: JSON.stringify({ page_id: input.pageId, link_data: { link: input.link, message: input.message, name: input.headline, image_url: input.imageUrl, call_to_action: { type: "LEARN_MORE", value: { link: input.link } } } }),
  });
}

export async function createMetaAd(input: { accountId: string; accessToken: string; name: string; adsetId: string; creativeId: string; status?: "ACTIVE" | "PAUSED" }) {
  return graphPost(`${input.accountId}/ads`, input.accessToken, { name: input.name.slice(0, 200), adset_id: input.adsetId, creative: JSON.stringify({ creative_id: input.creativeId }), status: input.status ?? "PAUSED" });
}

/**
 * Basule le statut d'un objet Meta déjà créé (campagne, adset ou ad — l'API Graph
 * accepte "status" sur les trois types de nœud de la même façon). Utilisé pour
 * l'activation post-paiement : on ne recrée rien, on passe juste PAUSED → ACTIVE.
 */
export async function setMetaObjectStatus(input: { id: string; accessToken: string; status: "ACTIVE" | "PAUSED" }) {
  return graphPost(input.id, input.accessToken, { status: input.status });
}

/**
 * Active une campagne Meta déjà créée en PAUSED (campagne, adset et ad) : c'est ce
 * basculement — et seulement lui — qui soumet la publicité à la modération de Meta
 * et démarre la diffusion réelle. Appelé uniquement après confirmation du paiement.
 */
export async function activateMetaCampaign(input: { campaignId: string; adSetId: string; adId: string; accessToken: string }) {
  await setMetaObjectStatus({ id: input.campaignId, accessToken: input.accessToken, status: "ACTIVE" });
  await setMetaObjectStatus({ id: input.adSetId, accessToken: input.accessToken, status: "ACTIVE" });
  await setMetaObjectStatus({ id: input.adId, accessToken: input.accessToken, status: "ACTIVE" });
}

/**
 * Interroge Meta pour savoir où en est la modération d'une publicité soumise.
 * effective_status possibles (doc Meta) : PENDING_REVIEW, IN_PROCESS, PREAPPROVED,
 * PENDING_BILLING_INFO (encore en cours) ; ACTIVE (approuvée, diffusion en cours) ;
 * DISAPPROVED, WITH_ISSUES (refusée) ; CAMPAIGN_PAUSED / ADSET_PAUSED (mis en pause
 * en amont — normal tant que activateMetaCampaign() n'a pas encore été appelé).
 */
export async function getMetaAdReviewStatus(input: { adId: string; accessToken: string }) {
  const json = await graphGet(input.adId, input.accessToken, "effective_status,ad_review_feedback");
  return {
    effectiveStatus: String(json.effective_status ?? ""),
    feedback: (json.ad_review_feedback as Record<string, unknown> | null) ?? null,
  };
}

/** Traduit le statut Meta en statut Vendeo. Retourne null si rien ne doit changer (encore en cours). */
export function mapMetaEffectiveStatus(effectiveStatus: string, feedback: Record<string, unknown> | null): { status: "active" | "rejected"; error: string | null } | null {
  if (effectiveStatus === "ACTIVE") return { status: "active", error: null };
  if (effectiveStatus === "DISAPPROVED" || effectiveStatus === "WITH_ISSUES") {
    // La forme exacte de ad_review_feedback varie selon le type de refus (global vs par ligne).
    // On prend le texte tel quel pour l'afficher à l'utilisateur, tronqué par sécurité.
    let reason = "Publicité refusée par Meta.";
    try {
      const flat = JSON.stringify(feedback ?? {});
      if (flat && flat !== "{}" && flat !== "null") reason = flat.slice(0, 480);
    } catch {
      // garde le message par défaut
    }
    return { status: "rejected", error: reason };
  }
  return null; // PENDING_REVIEW, IN_PROCESS, PREAPPROVED, PENDING_BILLING_INFO...
}
