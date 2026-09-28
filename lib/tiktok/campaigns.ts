import { TIKTOK_API_BASE_URL } from "./api";

async function tiktokPost(path: string, accessToken: string, body: Record<string, unknown>) {
  const response = await fetch(`${TIKTOK_API_BASE_URL}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "Access-Token": accessToken }, body: JSON.stringify(body), cache: "no-store" });
  const json = await response.json().catch(() => ({})) as { code: number; message: string; data?: Record<string, unknown> };
  if (!response.ok || json.code !== 0) throw new Error(json.message || `TikTok request failed (${response.status})`);
  return json.data ?? {};
}

export async function createTikTokCampaign(input: { advertiserId: string; accessToken: string; name: string; objective: "sales" | "traffic" | "engagement" | "leads" }) {
  // objective_type (valeur vérifiée via le SDK officiel tiktok-business-api-sdk /
  // doc "Create Campaign" v1.3) : la conversion site web s'appelle
  // WEBSITE_CONVERSIONS, pas "CONVERSIONS" (valeur qui n'existe pas chez TikTok).
  const objectiveType = input.objective === "sales" ? "WEBSITE_CONVERSIONS" : input.objective === "traffic" ? "TRAFFIC" : input.objective === "leads" ? "LEAD_GENERATION" : "ENGAGEMENT";
  const data = await tiktokPost("campaign/create/", input.accessToken, {
    advertiser_id: input.advertiserId,
    campaign_name: input.name.slice(0, 512),
    objective_type: objectiveType,
    budget_mode: "BUDGET_MODE_INFINITE", // le budget réel est porté par l'ad group, comme chez Meta
    operation_status: "ENABLE", // comme Meta (création directement ACTIVE au lancement)
  });
  return { id: String(data.campaign_id), objective: objectiveType };
}

export async function createTikTokAdGroup(input: { advertiserId: string; accessToken: string; campaignId: string; name: string; dailyBudget: number; locationIds: string[]; minAge: number; maxAge: number; identityId: string; identityType: string; pixelId?: string; objective: "sales" | "traffic" | "engagement" | "leads" }) {
  const optimizationGoal = input.objective === "sales" || input.objective === "leads" ? "CONVERT" : "CLICK";
  const body: Record<string, unknown> = {
    advertiser_id: input.advertiserId,
    campaign_id: input.campaignId,
    adgroup_name: input.name.slice(0, 512),
    placement_type: "PLACEMENT_TYPE_AUTOMATIC",
    location_ids: input.locationIds, // location_id numériques (résolus depuis les codes pays via /search/region/)
    age_groups: tiktokAgeGroups(input.minAge, input.maxAge),
    budget_mode: "BUDGET_MODE_DAY",
    budget: input.dailyBudget,
    billing_event: optimizationGoal === "CONVERT" ? "OCPM" : "CPC",
    optimization_goal: optimizationGoal,
    pacing: "PACING_MODE_SMOOTH",
    schedule_type: "SCHEDULE_FROM_NOW",
    operation_status: "ENABLE",
    identity_id: input.identityId,
    identity_type: input.identityType,
  };
  // CONVERT exige un pixel TikTok configuré sur le tunnel de vente : pixel_id est
  // requis par TikTok quand optimization_goal vaut CONVERT, sinon la création est
  // rejetée. L'appelant (launchTikTok) le récupère via /pixel/list/.
  if (optimizationGoal === "CONVERT" && input.pixelId) body.pixel_id = input.pixelId;
  const data = await tiktokPost("adgroup/create/", input.accessToken, body);
  return { id: String(data.adgroup_id) };
}

function tiktokAgeGroups(minAge: number, maxAge: number) {
  // TikTok segmente par tranches fixes plutôt qu'un min/max libre comme Meta.
  const brackets: Array<[number, number, string]> = [[13, 17, "AGE_13_17"], [18, 24, "AGE_18_24"], [25, 34, "AGE_25_34"], [35, 44, "AGE_35_44"], [45, 54, "AGE_45_54"], [55, 200, "AGE_55_100"]];
  return brackets.filter(([low, high]) => high >= minAge && low <= maxAge).map(([, , code]) => code);
}

export async function uploadTikTokAdImage(input: { advertiserId: string; accessToken: string; imageUrl: string }) {
  const data = await tiktokPost("file/image/ad/upload/", input.accessToken, { advertiser_id: input.advertiserId, upload_type: "UPLOAD_BY_URL", image_url: input.imageUrl });
  return { imageId: String(data.image_id) };
}

export async function createTikTokAd(input: { advertiserId: string; accessToken: string; adgroupId: string; name: string; identityId: string; identityType: string; imageId: string; text: string; link: string }) {
  const data = await tiktokPost("ad/create/", input.accessToken, {
    advertiser_id: input.advertiserId,
    adgroup_id: input.adgroupId,
    creatives: [{
      ad_name: input.name.slice(0, 512),
      ad_format: "SINGLE_IMAGE",
      identity_id: input.identityId,
      identity_type: input.identityType,
      image_ids: [input.imageId],
      ad_text: input.text.slice(0, 100),
      landing_page_url: input.link,
      call_to_action: "LEARN_MORE",
      operation_status: "ENABLE",
    }],
  });
  const adIds = (data as { ad_ids?: string[] }).ad_ids ?? [];
  return { id: String(adIds[0] ?? "") };
}

// TikTok n'a pas d'équivalent au basculement "PAUSED -> ACTIVE" fait objet par
// objet chez Meta : on passe par les endpoints dédiés de mise à jour de statut
// (campaign/adgroup/ad "status/update"), qui prennent les listes d'ids en masse.
// operation_status accepté : "ENABLE" / "DISABLE" (défaut ENABLE côté TikTok).
async function setTikTokStatus(advertiserId: string, accessToken: string, endpoint: string, ids: string[]) {
  const idsField = endpoint === "campaign" ? "campaign_ids" : endpoint === "adgroup" ? "adgroup_ids" : "ad_ids";
  await tiktokPost(`${endpoint}/status/update/`, accessToken, {
    advertiser_id: advertiserId,
    [idsField]: ids,
    operation_status: "ENABLE",
  });
}

/**
 * Active une campagne TikTok déjà créée en DISABLE (campagne, ad group et ad).
 * C'est ce basculement qui soumet la publicité à la modération TikTok et démarre
 * la diffusion — appelé au moment de l'activation (post-paiement), comme chez Meta.
 */
export async function activateTikTokCampaign(input: { advertiserId: string; accessToken: string; campaignId: string; adGroupId: string; adId: string }) {
  await setTikTokStatus(input.advertiserId, input.accessToken, "campaign", [input.campaignId]);
  await setTikTokStatus(input.advertiserId, input.accessToken, "adgroup", [input.adGroupId]);
  await setTikTokStatus(input.advertiserId, input.accessToken, "ad", [input.adId]);
}
