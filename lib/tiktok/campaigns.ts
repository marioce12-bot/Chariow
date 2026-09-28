import { TIKTOK_API_BASE_URL } from "./api";

async function tiktokPost(path: string, accessToken: string, body: Record<string, unknown>) {
  const response = await fetch(`${TIKTOK_API_BASE_URL}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "Access-Token": accessToken }, body: JSON.stringify(body), cache: "no-store" });
  const json = await response.json().catch(() => ({})) as { code: number; message: string; data?: Record<string, unknown> };
  if (!response.ok || json.code !== 0) throw new Error(json.message || `TikTok request failed (${response.status})`);
  return json.data ?? {};
}

type Objective = "sales" | "traffic" | "engagement" | "leads";

export async function createTikTokCampaign(input: { advertiserId: string; accessToken: string; name: string; objective: Objective }) {
  // objective_type (valeur vérifiée via le SDK officiel tiktok-business-api-sdk /
  // doc "Create Campaign" v1.3) : la conversion site web s'appelle
  // WEBSITE_CONVERSIONS, pas "CONVERSIONS" (valeur qui n'existe pas chez TikTok).
  // "engagement" : toutes les pubs Vendeo pointent vers une page de destination
  // (landing_page_url), ce que l'objectif ENGAGEMENT de TikTok (interaction
  // communautaire) ne permet pas — on utilise donc TRAFFIC.
  const objectiveType = input.objective === "sales" ? "WEBSITE_CONVERSIONS" : input.objective === "leads" ? "LEAD_GENERATION" : "TRAFFIC";
  const data = await tiktokPost("campaign/create/", input.accessToken, {
    advertiser_id: input.advertiserId,
    campaign_name: input.name.slice(0, 512),
    objective_type: objectiveType,
    budget_mode: "BUDGET_MODE_INFINITE", // le budget réel est porté par l'ad group, comme chez Meta
    operation_status: "ENABLE", // comme Meta (création directement ACTIVE au lancement)
  });
  return { id: String(data.campaign_id), objective: objectiveType };
}

// Format attendu par TikTok pour schedule_start_time : "YYYY-MM-DD HH:MM:SS" en UTC.
// Doit être dans le futur : on ajoute quelques minutes de marge.
function tiktokStartTime() {
  const d = new Date(Date.now() + 5 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export async function createTikTokAdGroup(input: { advertiserId: string; accessToken: string; campaignId: string; name: string; dailyBudget: number; locationIds: string[]; minAge: number; maxAge: number; identityId: string; identityType: string; pixelId?: string; objective: Objective }) {
  const optimizationGoal = input.objective === "sales" || input.objective === "leads" ? "CONVERT" : "CLICK";
  if (optimizationGoal === "CONVERT" && !input.pixelId) throw new Error("Pixel TikTok manquant pour l'objectif ventes/leads");
  const body: Record<string, unknown> = {
    advertiser_id: input.advertiserId,
    campaign_id: input.campaignId,
    adgroup_name: input.name.slice(0, 512),
    // Requis par TikTok pour les objectifs Traffic / Conversions web / Leads :
    // indique que la destination est un site web (et non une app).
    promotion_type: "WEBSITE",
    placement_type: "PLACEMENT_TYPE_AUTOMATIC",
    location_ids: input.locationIds, // location_id numériques (résolus depuis les codes pays via /search/region/)
    age_groups: tiktokAgeGroups(input.minAge, input.maxAge),
    budget_mode: "BUDGET_MODE_DAY",
    budget: input.dailyBudget, // en devise du compte TikTok Ads (pas forcément USD)
    billing_event: optimizationGoal === "CONVERT" ? "OCPM" : "CPC",
    optimization_goal: optimizationGoal,
    pacing: "PACING_MODE_SMOOTH",
    schedule_type: "SCHEDULE_FROM_NOW",
    schedule_start_time: tiktokStartTime(), // obligatoire même avec SCHEDULE_FROM_NOW
    operation_status: "ENABLE",
    identity_id: input.identityId,
    identity_type: input.identityType,
  };
  if (optimizationGoal === "CONVERT") {
    // CONVERT exige un pixel ET un événement à optimiser (optimization_event).
    // Ventes -> achat finalisé ; leads -> soumission de formulaire.
    body.pixel_id = input.pixelId;
    body.optimization_event = input.objective === "sales" ? "SHOPPING" : "FORM";
  }
  const data = await tiktokPost("adgroup/create/", input.accessToken, body);
  return { id: String(data.adgroup_id) };
}

function tiktokAgeGroups(minAge: number, maxAge: number) {
  // TikTok segmente par tranches fixes plutôt qu'un min/max libre comme Meta.
  // AGE_13_17 est exclue : le ciblage des mineurs n'est pas autorisé pour les pubs.
  const brackets: Array<[number, number, string]> = [[18, 24, "AGE_18_24"], [25, 34, "AGE_25_34"], [35, 44, "AGE_35_44"], [45, 54, "AGE_45_54"], [55, 200, "AGE_55_100"]];
  const groups = brackets.filter(([low, high]) => high >= minAge && low <= maxAge).map(([, , code]) => code);
  return groups.length ? groups : brackets.map(([, , code]) => code);
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

/**
 * Supprime une campagne TikTok (et ce qu'elle contient). À appeler quand la
 * création échoue à mi-chemin (ad group ou ad refusé) pour ne pas laisser de
 * campagne orpheline chez TikTok à chaque "Réessayer".
 */
export async function deleteTikTokCampaign(input: { advertiserId: string; accessToken: string; campaignId: string }) {
  await tiktokPost("campaign/status/update/", input.accessToken, {
    advertiser_id: input.advertiserId,
    campaign_ids: [input.campaignId],
    operation_status: "DELETE",
  });
}

// TikTok n'a pas d'équivalent au basculement "PAUSED -> ACTIVE" fait objet par
// objet chez Meta : on passe par les endpoints dédiés de mise à jour de statut
// (campaign/adgroup/ad "status/update"), qui prennent les listes d'ids en masse.
// operation_status accepté : "ENABLE" / "DISABLE" (défaut ENABLE côté TikTok).
async function setTikTokStatus(advertiserId: string, accessToken: string, endpoint: string, ids: string[], status: "ENABLE" | "DISABLE") {
  const idsField = endpoint === "campaign" ? "campaign_ids" : endpoint === "adgroup" ? "adgroup_ids" : "ad_ids";
  await tiktokPost(`${endpoint}/status/update/`, accessToken, {
    advertiser_id: advertiserId,
    [idsField]: ids,
    operation_status: status,
  });
}

/**
 * Active une campagne TikTok créée en DISABLE (campagne, ad group et ad).
 * Non utilisée aujourd'hui : le lancement crée tout directement en ENABLE.
 * Gardée pour un éventuel flux "créer en pause puis activer".
 */
export async function activateTikTokCampaign(input: { advertiserId: string; accessToken: string; campaignId: string; adGroupId: string; adId: string }) {
  await setTikTokStatus(input.advertiserId, input.accessToken, "campaign", [input.campaignId], "ENABLE");
  await setTikTokStatus(input.advertiserId, input.accessToken, "adgroup", [input.adGroupId], "ENABLE");
  await setTikTokStatus(input.advertiserId, input.accessToken, "ad", [input.adId], "ENABLE");
}

/**
 * Met en pause une campagne TikTok (campagne, ad group et ad). Utilisé par le
 * pilotage automatique quand la campagne n'est pas rentable.
 */
export async function pauseTikTokCampaign(input: { advertiserId: string; accessToken: string; campaignId: string; adGroupId: string; adId: string }) {
  await setTikTokStatus(input.advertiserId, input.accessToken, "campaign", [input.campaignId], "DISABLE");
  await setTikTokStatus(input.advertiserId, input.accessToken, "adgroup", [input.adGroupId], "DISABLE");
  await setTikTokStatus(input.advertiserId, input.accessToken, "ad", [input.adId], "DISABLE");
}
