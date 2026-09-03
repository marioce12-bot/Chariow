import { TIKTOK_API_BASE_URL } from "./api";

async function tiktokPost(path: string, accessToken: string, body: Record<string, unknown>) {
  const response = await fetch(`${TIKTOK_API_BASE_URL}/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "Access-Token": accessToken }, body: JSON.stringify(body), cache: "no-store" });
  const json = await response.json().catch(() => ({})) as { code: number; message: string; data?: Record<string, unknown> };
  if (!response.ok || json.code !== 0) throw new Error(json.message || `TikTok request failed (${response.status})`);
  return json.data ?? {};
}

export async function createTikTokCampaign(input: { advertiserId: string; accessToken: string; name: string; objective: "sales" | "traffic" | "engagement" | "leads" }) {
  // ⚠️ Vérifie les valeurs exactes de objective_type dans la doc au moment de l'intégration
  // (business-api.tiktok.com/portal/docs → Campaign → Create) : TikTok les renomme parfois.
  const objectiveType = input.objective === "sales" ? "CONVERSIONS" : input.objective === "traffic" ? "TRAFFIC" : input.objective === "leads" ? "LEAD_GENERATION" : "ENGAGEMENT";
  const data = await tiktokPost("campaign/create/", input.accessToken, {
    advertiser_id: input.advertiserId,
    campaign_name: input.name.slice(0, 512),
    objective_type: objectiveType,
    budget_mode: "BUDGET_MODE_INFINITE", // le budget réel est porté par l'ad group, comme chez Meta
    operation_status: "DISABLE", // équivalent du status "PAUSED" de Meta
  });
  return { id: String(data.campaign_id), objective: objectiveType };
}

export async function createTikTokAdGroup(input: { advertiserId: string; accessToken: string; campaignId: string; name: string; dailyBudget: number; countries: string[]; minAge: number; maxAge: number; identityId: string; identityType: string; pixelId?: string; objective: "sales" | "traffic" | "engagement" | "leads" }) {
  const optimizationGoal = input.objective === "sales" || input.objective === "leads" ? "CONVERT" : "CLICK";
  const body: Record<string, unknown> = {
    advertiser_id: input.advertiserId,
    campaign_id: input.campaignId,
    adgroup_name: input.name.slice(0, 512),
    placement_type: "PLACEMENT_TYPE_AUTOMATIC",
    location_ids: input.countries, // ⚠️ doit contenir des location_id TikTok (numériques), pas "BJ" — voir fetchTikTokRegions
    age_groups: tiktokAgeGroups(input.minAge, input.maxAge),
    budget_mode: "BUDGET_MODE_DAY",
    budget: input.dailyBudget,
    billing_event: optimizationGoal === "CONVERT" ? "OCPM" : "CPC",
    optimization_goal: optimizationGoal,
    pacing: "PACING_MODE_SMOOTH",
    schedule_type: "SCHEDULE_FROM_NOW",
    operation_status: "DISABLE",
    identity_id: input.identityId,
    identity_type: input.identityType,
  };
  // CONVERT exige un pixel TikTok configuré sur ton tunnel de vente — sans ça, reste sur "traffic"/"engagement" en sandbox.
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
      operation_status: "DISABLE",
    }],
  });
  const adIds = (data as { ad_ids?: string[] }).ad_ids ?? [];
  return { id: String(adIds[0] ?? "") };
}
