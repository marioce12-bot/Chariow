export type DashboardCampaign = {
  id: string;
  status: string;
  external_campaign_id?: string | null;
};

export type DashboardVariantPack = {
  id: string;
  status: string;
  external_campaign_id?: string | null;
  checkpoints?: { activated?: boolean; campaignId?: string | null; meta_state?: { status?: string; synced_at?: string } | null } | null;
  variants?: unknown[];
};

function campaignKey(row: { id: string; external_campaign_id?: string | null; checkpoints?: { campaignId?: string | null } | null }, prefix: "campaign" | "pack") {
  const externalId = (row.external_campaign_id || row.checkpoints?.campaignId)?.trim();
  return externalId ? `meta:${externalId}` : `${prefix}:${row.id}`;
}

/**
 * Count one row per campaign whose current Meta status is active or in review.
 * A confirmed Pack counts only after a status sync; its three ads share one parent.
 */
export function countRunningCampaigns(campaigns: DashboardCampaign[], packs: DashboardVariantPack[]) {
  const packByKey = new Map<string, DashboardVariantPack>();
  for (const pack of packs) {
    if (pack.status !== "completed" || pack.checkpoints?.activated !== true) continue;
    const key = campaignKey(pack, "pack");
    const previous = packByKey.get(key);
    const currentTime = Date.parse(pack.checkpoints?.meta_state?.synced_at ?? "");
    const previousTime = Date.parse(previous?.checkpoints?.meta_state?.synced_at ?? "");
    if (!previous || (Number.isFinite(currentTime) && (!Number.isFinite(previousTime) || currentTime > previousTime))) packByKey.set(key, pack);
  }
  const counted = new Set<string>();
  let count = 0;

  for (const campaign of campaigns) {
    const key = campaignKey(campaign, "campaign");
    const linkedPack = packByKey.get(key);
    const packStatus = linkedPack?.checkpoints?.meta_state?.status;
    // A linked Pack is the authoritative Meta object. If its status is unknown
    // or not yet synced, never fall back to a stale active campaign row.
    const effectiveStatus = linkedPack ? (packStatus ?? "unknown") : campaign.status;
    if ((effectiveStatus === "active" || effectiveStatus === "review") && !counted.has(key)) {
      counted.add(key);
      count++;
    }
  }

  for (const [key, pack] of packByKey) {
    if (pack.status !== "completed" || pack.checkpoints?.activated !== true) continue;
    const packStatus = pack.checkpoints?.meta_state?.status;
    if (packStatus !== "active" && packStatus !== "review") continue;
    if (counted.has(key)) continue;
    counted.add(key);
    count++;
  }

  return count;
}
