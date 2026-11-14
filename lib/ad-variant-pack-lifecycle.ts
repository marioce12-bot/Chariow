import { mapMetaEffectiveStatus } from "@/lib/meta/campaigns";

export type PackLifecycleStatus = "active" | "review" | "preparing" | "unknown" | "rejected" | "paused" | "archived" | "deleted";

export type PackMetaNode = {
  id: string;
  account_id?: string;
  campaign_id?: string;
  adset_id?: string;
  status?: string;
  effective_status?: string;
  ad_review_feedback?: Record<string, unknown> | null;
};

export type PackMetaSnapshot = {
  campaign: PackMetaNode;
  adsets: PackMetaNode[];
  ads: PackMetaNode[];
  missing?: boolean;
  accountStatus?: number | null;
};

export type PackMetaStateNode = {
  id: string;
  status: PackLifecycleStatus;
  status_raw: string | null;
  effective_status: string | null;
};

export type PackMetaState = {
  status: PackLifecycleStatus;
  synced_at: string;
  source: "meta" | "vendeo";
  campaign?: PackMetaStateNode;
  adsets?: PackMetaStateNode[];
  ads?: PackMetaStateNode[];
  sync_error?: string;
};

const terminal = new Set<PackLifecycleStatus>(["archived", "deleted"]);

function nodeStatus(node: PackMetaNode, accountStatus?: number | null): PackLifecycleStatus {
  const effective = (node.effective_status || node.status || "").toUpperCase();
  return mapMetaEffectiveStatus(effective, node.ad_review_feedback ?? null, accountStatus)?.status ?? "unknown";
}

function stateNode(node: PackMetaNode, accountStatus?: number | null): PackMetaStateNode {
  return {
    id: node.id,
    status: nodeStatus(node, accountStatus),
    status_raw: typeof node.status === "string" ? node.status : null,
    effective_status: typeof node.effective_status === "string" ? node.effective_status : null,
  };
}

export function buildPackMetaState(snapshot: PackMetaSnapshot, syncedAt = new Date().toISOString()): PackMetaState {
  const campaign = stateNode(snapshot.campaign, snapshot.accountStatus);
  const adsets = snapshot.adsets.map((node) => stateNode(node, snapshot.accountStatus));
  const ads = snapshot.ads.map((node) => stateNode(node, snapshot.accountStatus));
  let status: PackLifecycleStatus = "unknown";

  if (terminal.has(campaign.status)) {
    status = campaign.status;
  } else if (adsets.length && adsets.every((item) => terminal.has(item.status))) {
    status = adsets.some((item) => item.status === "deleted") ? "deleted" : "archived";
  } else if (campaign.status === "paused") {
    status = "paused";
  } else if (ads.some((item) => item.status === "active")) {
    status = "active";
  } else if (ads.some((item) => item.status === "review")) {
    status = "review";
  } else if (ads.some((item) => item.status === "preparing")) {
    status = "preparing";
  } else if (ads.some((item) => item.status === "rejected")) {
    status = "rejected";
  } else if (ads.length && ads.every((item) => item.status === "deleted")) {
    status = "deleted";
  } else if (ads.length && ads.every((item) => item.status === "archived")) {
    status = "archived";
  } else if (ads.length && ads.every((item) => item.status === "paused" || terminal.has(item.status))) {
    status = "paused";
  } else if (adsets.length && adsets.every((item) => item.status === "paused" || terminal.has(item.status))) {
    status = "paused";
  } else if (campaign.status === "review" || adsets.some((item) => item.status === "review")) {
    status = "review";
  } else if (campaign.status === "preparing" || adsets.some((item) => item.status === "preparing")) {
    status = "preparing";
  }

  return { status, synced_at: syncedAt, source: "meta", campaign, adsets, ads };
}

export function unavailablePackMetaState(syncedAt: string, error?: string): PackMetaState {
  return {
    status: "unknown",
    synced_at: syncedAt,
    source: "meta",
    ...(error ? { sync_error: error.slice(0, 240) } : {}),
  };
}

export function withPackMetaState(checkpoints: unknown, metaState: PackMetaState): Record<string, unknown> {
  const existing = checkpoints && typeof checkpoints === "object" && !Array.isArray(checkpoints)
    ? checkpoints as Record<string, unknown>
    : {};
  return { ...existing, meta_state: metaState };
}

export function isTerminalPackMetaState(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const status = (value as Record<string, unknown>).status;
  return status === "archived" || status === "deleted";
}

/** Mark Packs that share a just-deleted standard campaign as terminal, retaining their history. */
export async function markLinkedVariantPacksDeleted(input: {
  client: any;
  userId: string;
  metaAdAccountId: string | null;
  externalCampaignId: string;
  source: "vendeo";
  now?: string;
}) {
  if (!input.metaAdAccountId || !input.externalCampaignId) return { updated: 0 };
  const { data: packs, error } = await input.client
    .from("ad_variant_packs")
    .select("id,checkpoints,updated_at")
    .eq("user_id", input.userId)
    .eq("meta_ad_account_id", input.metaAdAccountId)
    .eq("external_campaign_id", input.externalCampaignId)
    .limit(100);
  if (error) throw new Error("Impossible de synchroniser le Pack lié à la campagne supprimée.");

  const now = input.now ?? new Date().toISOString();
  let updated = 0;
  for (const pack of packs ?? []) {
    const previous = (pack.checkpoints?.meta_state ?? {}) as Record<string, unknown>;
    const metaState: PackMetaState = {
      ...previous,
      status: "deleted",
      synced_at: now,
      source: input.source,
      campaign: {
        id: input.externalCampaignId,
        status: "deleted",
        status_raw: "DELETED",
        effective_status: "DELETED",
      },
    };
    const { data, error: updateError } = await input.client
      .from("ad_variant_packs")
      .update({ checkpoints: withPackMetaState(pack.checkpoints, metaState), updated_at: now })
      .eq("id", pack.id)
      .eq("user_id", input.userId)
      .eq("updated_at", pack.updated_at)
      .select("id")
      .maybeSingle();
    if (updateError || !data) throw new Error("La campagne Meta a été supprimée, mais son Pack n’a pas pu être synchronisé dans Vendeo.");
    updated += 1;
  }
  return { updated };
}

export async function syncLinkedStandardCampaignTerminal(input: {
  client: any;
  userId: string;
  metaAdAccountId: string | null;
  externalCampaignId: string;
  status: "archived" | "deleted";
}) {
  if (!input.metaAdAccountId || !input.externalCampaignId) return { updated: 0 };
  const marker = input.status === "deleted" ? "META_DELETED:Campaign deleted in Meta; history retained." : "META_ARCHIVED:Campaign archived in Meta; history retained.";
  const { data, error } = await input.client.from("ad_campaigns")
    .update({ status: input.status, external_error: marker })
    .eq("user_id", input.userId)
    .eq("meta_ad_account_id", input.metaAdAccountId)
    .eq("external_campaign_id", input.externalCampaignId)
    .select("id");
  if (error) throw new Error("Le statut terminal du Pack n’a pas pu être propagé à la campagne liée.");
  return { updated: Array.isArray(data) ? data.length : 0 };
}

export async function syncLinkedStandardCampaignStatus(input: {
  client: any;
  userId: string;
  metaAdAccountId: string | null;
  externalCampaignId: string;
  status: PackLifecycleStatus;
}) {
  if (!input.metaAdAccountId || !input.externalCampaignId || input.status === "unknown") return { updated: 0 };
  const externalError = input.status === "deleted"
    ? "META_DELETED:Campaign deleted in Meta; history retained."
    : input.status === "archived"
      ? "META_ARCHIVED:Campaign archived in Meta; history retained."
      : input.status === "rejected"
        ? "META_REJECTED:Meta rejected one or more Pack ads."
        : null;
  const { data, error } = await input.client.from("ad_campaigns")
    .update({ status: input.status, external_error: externalError })
    .eq("user_id", input.userId)
    .eq("meta_ad_account_id", input.metaAdAccountId)
    .eq("external_campaign_id", input.externalCampaignId)
    .select("id");
  if (error) throw new Error("Le statut du Pack n’a pas pu être propagé à la campagne liée.");
  return { updated: Array.isArray(data) ? data.length : 0 };
}
