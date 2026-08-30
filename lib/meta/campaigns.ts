import { META_GRAPH_BASE_URL } from "./api";

type GraphResponse = Record<string, unknown>;

async function graphPost(path: string, accessToken: string, params: Record<string, string>) {
  const body = new URLSearchParams({ ...params, access_token: accessToken });
  const response = await fetch(`${META_GRAPH_BASE_URL}/${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  const json = await response.json().catch(() => ({})) as GraphResponse;
  if (!response.ok || typeof json.id !== "string") {
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
}) {
  // Meta keeps its objective names separate from the simpler Vendeo labels.
  const objective = input.objective === "sales" ? "OUTCOME_SALES" : input.objective === "traffic" ? "OUTCOME_TRAFFIC" : input.objective === "leads" ? "OUTCOME_LEADS" : "OUTCOME_ENGAGEMENT";
  const campaign = await graphPost(`${input.accountId}/campaigns`, input.accessToken, {
    name: input.name.slice(0, 200),
    objective,
    status: "PAUSED",
    special_ad_categories: "[]",
  });
  return { id: String(campaign.id), objective };
}

export async function createMetaAdSet(input: { accountId: string; accessToken: string; campaignId: string; name: string; dailyBudget: number; countries: string[]; minAge: number; maxAge: number }) {
  return graphPost(`${input.accountId}/adsets`, input.accessToken, {
    name: input.name.slice(0, 200),
    campaign_id: input.campaignId,
    daily_budget: String(Math.round(input.dailyBudget * 100)),
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    targeting: JSON.stringify({ geo_locations: { countries: input.countries }, age_min: input.minAge, age_max: input.maxAge }),
    status: "PAUSED",
  });
}

export async function createMetaCreative(input: { accountId: string; accessToken: string; name: string; pageId: string; link: string; message: string; headline: string; imageUrl: string }) {
  return graphPost(`${input.accountId}/adcreatives`, input.accessToken, {
    name: input.name.slice(0, 200),
    object_story_spec: JSON.stringify({ page_id: input.pageId, link_data: { link: input.link, message: input.message, name: input.headline, image_url: input.imageUrl, call_to_action: { type: "LEARN_MORE", value: { link: input.link } } } }),
  });
}

export async function createMetaAd(input: { accountId: string; accessToken: string; name: string; adsetId: string; creativeId: string }) {
  return graphPost(`${input.accountId}/ads`, input.accessToken, { name: input.name.slice(0, 200), adset_id: input.adsetId, creative: JSON.stringify({ creative_id: input.creativeId }), status: "PAUSED" });
}
