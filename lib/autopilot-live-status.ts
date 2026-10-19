import { evaluateMetaDelivery } from "@/lib/meta/delivery";
import { decryptSecret } from "@/lib/crypto";
import { META_GRAPH_BASE_URL } from "@/lib/meta/api";
import { TIKTOK_API_BASE_URL } from "@/lib/tiktok/api";
import type { AutopilotLiveStatus } from "@/lib/autopilot-eligibility";
import { getMetaCampaignLifecycle, getMetaPausedReason, isMetaPausedReason } from "@/lib/meta/status";
export type { AutopilotLiveStatus } from "@/lib/autopilot-eligibility";

const TIMEOUT_MS = 8_000;
const BATCH_DEADLINE_MS = 18_000;
const nowIso = () => new Date().toISOString();
const result = (state: AutopilotLiveStatus["state"], reason: string, checked_at = nowIso()): AutopilotLiveStatus => ({ state, checked_at, reason });
const missing = (value: unknown) => typeof value !== "string" || !value.trim();

/** Pure, fail-closed Meta entity classifier. Only explicit ACTIVE qualifies. */
export function classifyMetaLiveStatus(entity: Record<string, unknown> | null | undefined): "active" | "inactive" | "unknown" {
  if (!entity) return "unknown";
  const effective = typeof entity.effective_status === "string" ? entity.effective_status.toUpperCase() : "";
  const lifecycle = [effective, typeof entity.status === "string" ? entity.status.toUpperCase() : ""];
  if (lifecycle.some((v) => ["PAUSED", "ARCHIVED", "DELETED", "COMPLETED", "CAMPAIGN_PAUSED", "ADSET_PAUSED", "IN_PROCESS", "WITH_ISSUES", "PENDING_REVIEW", "PREPARING", "PROCESSING", "PENDING_PROCESS", "DISAPPROVED", "PREAPPROVED", "PENDING_BILLING_INFO"].includes(v))) return "inactive";
  if (effective === "ACTIVE") return "active";
  return "unknown";
}

/** TikTok official secondary_status values are entity-specific delivery enum strings. */
export function classifyTikTokLiveStatus(entity: Record<string, unknown> | null | undefined): "active" | "inactive" | "unknown" {
  if (!entity) return "unknown";
  const operation = typeof entity.operation_status === "string" ? entity.operation_status.toUpperCase() : "";
  const secondary = typeof entity.secondary_status === "string" ? entity.secondary_status.toUpperCase() : "";
  if (["DISABLE", "DELETE", "PAUSE", "PAUSED", "ARCHIVED", "DELETED", "COMPLETED", "CAMPAIGN_PAUSED", "ADGROUP_PAUSED", "AD_PAUSED", "AD_NOT_DELIVER", "CAMPAIGN_NOT_DELIVER", "ADGROUP_NOT_DELIVER", "CAMPAIGN_EXCEEDED_BUDGET", "CAMPAIGN_EXCEED_BUDGET", "NOT_DELIVER"].includes(operation) || ["PAUSED", "ARCHIVED", "DELETED", "COMPLETED", "CAMPAIGN_PAUSED", "ADGROUP_PAUSED", "AD_PAUSED", "AD_NOT_DELIVER", "CAMPAIGN_NOT_DELIVER", "ADGROUP_NOT_DELIVER", "CAMPAIGN_EXCEEDED_BUDGET", "CAMPAIGN_EXCEED_BUDGET", "NOT_DELIVER", "PENDING_REVIEW", "DISAPPROVED", "REJECTED", "SUSPENDED"].includes(secondary)) return "inactive";
  if (["ENABLE", "CAMPAIGN_STATUS_ENABLE", "CAMPAIGN_ENABLE"].includes(operation) && ["CAMPAIGN_DELIVERY_OK", "CAMPAIGN_STATUS_ENABLE"].includes(secondary)) return "active";
  if (["ENABLE", "ADGROUP_STATUS_ENABLE", "ADGROUP_ENABLE"].includes(operation) && ["ADGROUP_DELIVERY_OK", "AD_DELIVERY_OK", "ADGROUP_STATUS_DELIVERY_OK"].includes(secondary)) return "active";
  if (["ENABLE", "AD_STATUS_ENABLE", "AD_ENABLE"].includes(operation) && ["CREATIVE_DELIVERY_OK", "AD_STATUS_DELIVERY_OK"].includes(secondary)) return "active";
  return "unknown";
}

export function classifyCampaignLocalStatus(status: unknown): "active" | "inactive" | "unknown" {
  if (typeof status !== "string" || !status.trim()) return "unknown";
  const value = status;
  if (value === "active") return "active";
  if (["paused", "autopilot_paused", "archived", "deleted", "completed", "complete", "draft", "account_required", "pending_payment", "submitting", "review", "preparing", "rejected", "error"].includes(value)) return "inactive";
  return "unknown";
}

class PlatformVerificationError extends Error {
  constructor(readonly reasonCode: "TOKEN_EXPIRED" | "VERIFICATION_FAILED", readonly httpStatus: number, readonly providerCode?: number) {
    super("Platform verification failed");
  }
}

async function getJson(url: URL, headers?: Record<string, string>): Promise<Record<string, any>> {
  const response = await fetch(url, { method: "GET", headers, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  const json = await response.json().catch(() => ({})) as Record<string, any>;
  if (!response.ok || json.error || (typeof json.code === "number" && json.code !== 0)) {
    const providerCode = typeof json.error?.code === "number" ? json.error.code : typeof json.code === "number" ? json.code : undefined;
    throw new PlatformVerificationError(providerCode === 190 ? "TOKEN_EXPIRED" : "VERIFICATION_FAILED", response.status, providerCode);
  }
  return json;
}
function metaUrl(id: string, fields: string, token: string) {
  const url = new URL(`${META_GRAPH_BASE_URL}/${encodeURIComponent(id)}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", token);
  return url;
}
function getData(json: Record<string, any>): Record<string, any> | null {
  if (Array.isArray(json.data)) return json.data.length === 1 ? json.data[0] : null;
  if (json.data && typeof json.data === "object") {
    if (Array.isArray(json.data.list)) return json.data.list.length === 1 ? json.data.list[0] : null;
    return json.data;
  }
  return json;
}
function scheduledState(campaign: any, checkedAt: string, endKeys = ["end_time", "schedule_end_time"]): "active" | "inactive" | "unknown" | null {
  const now = Date.parse(checkedAt);
  for (const key of ["start_time", "schedule_start_time"]) {
    if (campaign?.[key] !== undefined && campaign[key] !== null && campaign[key] !== "") {
      const start = Date.parse(String(campaign[key]));
      if (!Number.isFinite(start)) return "unknown";
      if (start > now) return "unknown";
    }
  }
  for (const key of endKeys) {
    if (campaign?.[key] !== undefined && campaign[key] !== null && campaign[key] !== "") {
      const end = Date.parse(String(campaign[key]));
      if (!Number.isFinite(end)) return "unknown";
      if (end <= now) return "inactive";
    }
  }
  return null;
}

async function verifyMeta(supabase: any, userId: string, campaign: any, checkedAt: string): Promise<AutopilotLiveStatus> {
  if (missing(campaign.external_campaign_id) || missing(campaign.external_adset_id) || missing(campaign.external_ad_id) || missing(campaign.meta_ad_account_id)) return result("unknown", "Identifiants Meta incomplets", checkedAt);
  const lifecycle = getMetaCampaignLifecycle(String(campaign.status ?? ""), campaign.external_error);
  if (isMetaPausedReason(campaign.external_error)) return result("inactive", getMetaPausedReason(campaign.external_error) || "Campagne Meta mise en pause localement", checkedAt);
  if (lifecycle === "archived" || lifecycle === "deleted") return result("inactive", "Cycle de vie Meta local inactif", checkedAt);
  if (lifecycle === "unavailable") return result("unknown", "Meta indique une indisponibilité", checkedAt);
  try {
  const { data: account, error } = await supabase.from("meta_ad_accounts").select("meta_account_id,access_token_encrypted,is_active").eq("id", campaign.meta_ad_account_id).eq("user_id", userId).maybeSingle();
  if (error || !account?.access_token_encrypted || !account.meta_account_id) return result("unknown", "Compte ou identifiants Meta indisponibles", checkedAt);
  if (account.is_active !== true) return result("inactive", "Compte Meta local inactif", checkedAt);
    const token = decryptSecret(account.access_token_encrypted);
    const [accountJson, campaignJson, adsetJson, adJson] = await Promise.all([
      getJson(metaUrl(account.meta_account_id.startsWith("act_") ? account.meta_account_id : `act_${account.meta_account_id}`, "account_status", token)),
      getJson(metaUrl(String(campaign.external_campaign_id), "effective_status,status,start_time,stop_time", token)),
      getJson(metaUrl(String(campaign.external_adset_id), "effective_status,status,start_time,end_time", token)),
      getJson(metaUrl(String(campaign.external_ad_id), "effective_status,status,created_time,updated_time", token)),
    ]);
    if (String(accountJson.id ?? "") !== (account.meta_account_id.startsWith("act_") ? account.meta_account_id : `act_${account.meta_account_id}`)) return result("unknown", "Identité du compte Meta inattendue", checkedAt);
    const accountStatus = Number(accountJson.account_status);
    if (!Number.isInteger(accountStatus) || accountStatus <= 0) return result("unknown", "Statut du compte Meta inconnu", checkedAt);
    if (accountStatus !== 1) return result("inactive", "Compte Meta non actif", checkedAt);
    const entities = [getData(campaignJson), getData(adsetJson), getData(adJson)];
    if (entities.some((v) => !v)) return result("unknown", "État Meta incomplet", checkedAt);
    const [metaCampaign, metaAdset, metaAd] = entities as [Record<string, any>, Record<string, any>, Record<string, any>];
    if (String(metaCampaign.id ?? "") !== String(campaign.external_campaign_id) || String(metaAdset.id ?? "") !== String(campaign.external_adset_id) || String(metaAd.id ?? "") !== String(campaign.external_ad_id)) return result("unknown", "Identité d’un élément Meta inattendue", checkedAt);
    const states = entities.map(classifyMetaLiveStatus);
    if (states.includes("inactive")) return result("inactive", "Au moins un élément Meta n’est pas actif", checkedAt);
    if (!states.every((s) => s === "active")) return result("unknown", "État de diffusion Meta inconnu", checkedAt);
    const schedule = scheduledState({ ...campaign, end_time: getData(campaignJson)?.stop_time ?? campaign.end_time, start_time: getData(campaignJson)?.start_time ?? campaign.start_time }, checkedAt, ["end_time"]);
    const adsetSchedule = scheduledState(getData(adsetJson), checkedAt);
    if (adsetSchedule) return result(adsetSchedule, "Calendrier de l’ensemble Meta hors période", checkedAt);
    if (schedule) return result(schedule, schedule === "inactive" ? "Campagne Meta terminée" : "Début de campagne Meta à venir", checkedAt);
    const insightsUrl = metaUrl(String(campaign.external_ad_id), "impressions", token);
    insightsUrl.pathname += "/insights";
    insightsUrl.searchParams.set("date_preset", "maximum");
    const insights = await getJson(insightsUrl);
    if (!Array.isArray(insights.data) || insights.paging?.next) return result("unknown", "Preuve de diffusion Meta incomplète", checkedAt);
    const impressions = insights.data.length === 0 ? 0 : insights.data.length === 1 && insights.data[0]?.impressions != null ? Number(insights.data[0].impressions) : NaN;
    const delivery = evaluateMetaDelivery(String(campaign.external_ad_id), { effectiveStatus: String(metaAd.effective_status ?? ""), impressions, createdTime: metaAd.created_time, updatedTime: metaAd.updated_time }, campaign.meta_delivery_observation);
    if (delivery.state !== "active") return result(delivery.state === "preparing" ? "inactive" : "unknown", delivery.state === "preparing" ? "Préparation Meta : diffusion pas encore confirmée pour cette version de la publicité" : "Preuve de diffusion Meta inconnue", checkedAt);
    return result("active", "Vérification Meta fraîche : compte, campagne, ensemble et publicité actifs, diffusion confirmée", checkedAt);
  } catch (error) {
    const reasonCode = error instanceof PlatformVerificationError ? error.reasonCode : "VERIFICATION_FAILED";
    // Never log provider messages, URLs, tokens or encrypted credentials.
    console.warn("Autopilot Meta verification failed", {
      campaignId: campaign.id, reasonCode,
      ...(error instanceof PlatformVerificationError ? { httpStatus: error.httpStatus, providerCode: error.providerCode } : {}),
    });
    return { ...result("unknown", reasonCode === "TOKEN_EXPIRED" ? "Connexion Meta expirée ou révoquée" : "Vérification Meta impossible", checkedAt), reasonCode };
  }
}

async function verifyTikTok(supabase: any, userId: string, campaign: any, checkedAt: string): Promise<AutopilotLiveStatus> {
  if (missing(campaign.external_campaign_id) || missing(campaign.external_adset_id) || missing(campaign.external_ad_id) || missing(campaign.tiktok_ad_account_id)) return result("unknown", "Identifiants TikTok incomplets", checkedAt);
  try {
  const { data: account, error } = await supabase.from("tiktok_ad_accounts").select("tiktok_advertiser_id,tiktok_integration_id,is_active").eq("id", campaign.tiktok_ad_account_id).eq("user_id", userId).maybeSingle();
  if (error || !account?.tiktok_advertiser_id || !account.tiktok_integration_id) return result("unknown", "Compte TikTok indisponible", checkedAt);
  if (account.is_active !== true) return result("inactive", "Compte TikTok local inactif", checkedAt);
  const { data: integration, error: integrationError } = await supabase.from("tiktok_integrations").select("access_token_encrypted,is_active").eq("id", account.tiktok_integration_id).eq("user_id", userId).maybeSingle();
  if (integrationError || !integration?.access_token_encrypted) return result("unknown", "Intégration TikTok indisponible", checkedAt);
  if (integration.is_active !== true) return result("inactive", "Intégration TikTok locale inactive", checkedAt);
    const accessToken = decryptSecret(integration.access_token_encrypted);
    const query = (path: string) => { const u = new URL(`${TIKTOK_API_BASE_URL}/${path}`); u.searchParams.set("advertiser_id", String(account.tiktok_advertiser_id)); return u; };
    const headers = { "Access-Token": accessToken };
    const requests = [
      ["campaign/get/", "campaign_ids", String(campaign.external_campaign_id), "campaign_id"],
      ["adgroup/get/", "adgroup_ids", String(campaign.external_adset_id), "adgroup_id"],
      ["ad/get/", "ad_ids", String(campaign.external_ad_id), "ad_id"],
    ] as const;
    const records = await Promise.all(requests.map(async ([path, key, id, identity]) => {
      const url = query(path);
      url.searchParams.set("filtering", JSON.stringify({ [key]: [id] }));
      const record = getData(await getJson(url, headers));
      return record && String(record[identity] ?? "") === id ? record : null;
    }));
    if (records.some((v) => !v)) return result("unknown", "État TikTok incomplet", checkedAt);
    const states = records.map(classifyTikTokLiveStatus);
    if (states.includes("inactive")) return result("inactive", "Au moins un élément TikTok n’est pas diffusé", checkedAt);
    if (!states.every((s) => s === "active")) return result("unknown", "Statut de diffusion TikTok inconnu", checkedAt);
    const adgroup = records[1]!;
    const schedule = scheduledState({ ...campaign, schedule_start_time: adgroup.schedule_start_time, schedule_end_time: adgroup.schedule_end_time }, checkedAt);
    if (schedule) return result(schedule, schedule === "inactive" ? "Campagne TikTok terminée" : "Début de campagne TikTok à venir", checkedAt);
    return result("active", "Vérification TikTok fraîche : campagne, groupe et publicité ENABLE/LIVE", checkedAt);
  } catch {
    return result("unknown", "Vérification TikTok impossible", checkedAt);
  }
}

export async function checkAutopilotLiveStatus(supabase: any, userId: string, campaign: any): Promise<AutopilotLiveStatus> {
  const checkedAt = nowIso();
  if (!campaign || typeof campaign !== "object") return result("unknown", "Campagne absente", checkedAt);
  const local = classifyCampaignLocalStatus(campaign.status);
  if (local === "inactive") return result("inactive", "Statut local de campagne inactif", checkedAt);
  if (local !== "active") return result("unknown", "Statut local de campagne inconnu", checkedAt);
  if (campaign.platform === "pinterest") return result("unknown", "Pinterest non pris en charge", checkedAt);
  if (campaign.platform === "meta") return verifyMeta(supabase, userId, campaign, checkedAt);
  if (campaign.platform === "tiktok") return verifyTikTok(supabase, userId, campaign, checkedAt);
  return result("unknown", "Plateforme non prise en charge", checkedAt);
}

export async function checkAutopilotCampaigns(supabase: any, userId: string, campaigns: any[]): Promise<any[]> {
  const rows = Array.isArray(campaigns) ? campaigns : [];
  const output: any[] = new Array(rows.length);
  let cursor = 0;
  let expired = false;
  const worker = async () => {
    while (!expired && cursor < rows.length) {
      const index = cursor++;
      const campaign = rows[index];
      const checked = await checkAutopilotLiveStatus(supabase, userId, campaign);
      if (!expired) output[index] = { ...campaign, autopilot_live_status: checked };
    }
  };
  const workers = Promise.all(Array.from({ length: Math.min(5, rows.length) }, worker));
  let deadline: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([workers, new Promise<void>((resolve) => { deadline = setTimeout(() => { expired = true; resolve(); }, BATCH_DEADLINE_MS); })]);
  if (deadline) clearTimeout(deadline);
  for (let i = 0; i < rows.length; i++) {
    if (!output[i]) output[i] = { ...rows[i], autopilot_live_status: { state: "unknown", checked_at: nowIso(), reason: "Délai global de vérification dépassé" } satisfies AutopilotLiveStatus };
  }
  return output;
}
