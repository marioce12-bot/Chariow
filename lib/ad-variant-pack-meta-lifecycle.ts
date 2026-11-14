import { META_GRAPH_BASE_URL } from "@/lib/meta/api";
import { createMetaGraphError, fetchMetaGraph } from "@/lib/meta/graph";
import { deleteMetaCampaign, isMetaObjectMissingError, setMetaObjectStatus } from "@/lib/meta/campaigns";
import type { PackMetaNode, PackMetaSnapshot } from "@/lib/ad-variant-pack-lifecycle";

export type PackMetaLifecycleInput = {
  external_campaign_id?: string | null;
  meta_ad_account_id: string;
  checkpoints?: {
    campaignId?: string | null;
    adsets?: Array<string | null> | null;
    ads?: Array<string | null> | null;
  } | null;
};

type GraphRow = PackMetaNode & Record<string, unknown>;
type LifecycleContext = { pack: PackMetaLifecycleInput; accessToken: string; metaAccountId: string; accountStatus?: number | null };

function graphUrl(id: string, fields: string, accessToken: string) {
  const url = new URL(`${META_GRAPH_BASE_URL}/${id}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", accessToken);
  return url;
}

async function readNode(id: string, fields: string, accessToken: string): Promise<GraphRow> {
  const response = await fetchMetaGraph(graphUrl(id, fields, accessToken));
  const json = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || json.error || json.id !== id) {
    throw createMetaGraphError(json.error, response.status, `Lecture Meta non vérifiée pour ${id}`);
  }
  return json as GraphRow;
}

function normalizeAccountId(value: string) {
  return value.replace(/^act_/, "");
}

function missingNode(id: string, parent: { campaign_id?: string; adset_id?: string } = {}): PackMetaNode {
  return { id, ...parent, status: "DELETED", effective_status: "DELETED" };
}

function uniqueIds(values: Array<string | null> | null | undefined) {
  return [...new Set((values ?? []).filter((value): value is string => typeof value === "string" && value.length > 0))];
}

export function createPackMetaLifecycleOperations(context: LifecycleContext) {
  const { pack, accessToken, metaAccountId, accountStatus } = context;
  const campaignId = pack.external_campaign_id || pack.checkpoints?.campaignId || "";
  const adsetIds = uniqueIds(pack.checkpoints?.adsets);
  const adIds = uniqueIds(pack.checkpoints?.ads);
  const expectedAccount = normalizeAccountId(metaAccountId);

  const validateAccount = (node: GraphRow) => {
    if (normalizeAccountId(String(node.account_id ?? "")) !== expectedAccount) throw new Error("Entité Meta rattachée à un autre compte publicitaire");
  };

  async function read(): Promise<PackMetaSnapshot> {
    if (!campaignId || (pack.external_campaign_id && pack.checkpoints?.campaignId && pack.external_campaign_id !== pack.checkpoints.campaignId)) {
      throw new Error("Identifiant de campagne Meta du Pack incohérent");
    }
    if (!adsetIds.length || adsetIds.length > 3 || !adIds.length || adIds.length !== 3) {
      throw new Error("Identifiants Meta incomplets pour le Pack");
    }

    let campaign: GraphRow;
    try {
      campaign = await readNode(campaignId, "id,name,account_id,status,effective_status", accessToken);
    } catch (error) {
      if (error instanceof Error && isMetaObjectMissingError(error.message)) {
        return { campaign: missingNode(campaignId), adsets: [], ads: adIds.map((id) => missingNode(id)), missing: true, accountStatus };
      }
      throw error;
    }
    validateAccount(campaign);

    const campaignStates = [campaign.status, campaign.effective_status].filter((item): item is string => typeof item === "string").map((item) => item.toUpperCase());
    if (campaignStates.some((item) => ["DELETED", "CAMPAIGN_DELETED"].includes(item))) {
      return { campaign, adsets: [], ads: adIds.map((id) => missingNode(id)), missing: true, accountStatus };
    }

    const adsets = await Promise.all(adsetIds.map(async (id) => {
      try {
        const node = await readNode(id, "id,name,account_id,campaign_id,status,effective_status", accessToken);
        validateAccount(node);
        if (node.campaign_id !== campaignId) throw new Error("Ensemble de publicités rattaché à une autre campagne");
        return node;
      } catch (error) {
        if (error instanceof Error && isMetaObjectMissingError(error.message)) return missingNode(id, { campaign_id: campaignId });
        throw error;
      }
    }));
    const adsetIdSet = new Set(adsetIds);

    const ads = await Promise.all(adIds.map(async (id) => {
      try {
        const node = await readNode(id, "id,name,account_id,campaign_id,adset_id,status,effective_status,ad_review_feedback", accessToken);
        validateAccount(node);
        if (node.campaign_id !== campaignId || typeof node.adset_id !== "string" || !adsetIdSet.has(node.adset_id)) {
          throw new Error("Publicité Meta rattachée à une autre campagne ou à un autre ensemble");
        }
        return node;
      } catch (error) {
        if (error instanceof Error && isMetaObjectMissingError(error.message)) return missingNode(id, { campaign_id: campaignId });
        throw error;
      }
    }));

    return { campaign, adsets, ads, accountStatus };
  }

  return {
    read,
    /** Each call sends exactly one Graph write; callers must never retry an ambiguous result. */
    setStatus(id: string, status: "ACTIVE" | "PAUSED") {
      return setMetaObjectStatus({ id, accessToken, status });
    },
    deleteCampaign() {
      return deleteMetaCampaign({ campaignId, accessToken });
    },
    campaignId,
    adsetIds,
    adIds,
  };
}
