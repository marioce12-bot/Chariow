export type DashboardCampaign = {
  id: string;
  status: string;
  external_campaign_id?: string | null;
};

export type DashboardVariantPack = {
  id: string;
  status: string;
  external_campaign_id?: string | null;
  checkpoints?: { activated?: boolean } | null;
  variants?: unknown[];
};

function campaignKey(row: { id: string; external_campaign_id?: string | null }, prefix: "campaign" | "pack") {
  const externalId = row.external_campaign_id?.trim();
  return externalId ? `meta:${externalId}` : `${prefix}:${row.id}`;
}

/**
 * Count one row per active campaign. A Pack is eligible only after its launch
 * is durably confirmed; its three ad variants still share one parent campaign.
 */
export function countRunningCampaigns(campaigns: DashboardCampaign[], packs: DashboardVariantPack[]) {
  const represented = new Set<string>();
  const counted = new Set<string>();
  let count = 0;

  for (const campaign of campaigns) {
    const key = campaignKey(campaign, "campaign");
    represented.add(key);
    if ((campaign.status === "active" || campaign.status === "review") && !counted.has(key)) {
      counted.add(key);
      count++;
    }
  }

  for (const pack of packs) {
    if (pack.status !== "completed" || pack.checkpoints?.activated !== true) continue;
    const key = campaignKey(pack, "pack");
    if (represented.has(key) || counted.has(key)) continue;
    represented.add(key);
    counted.add(key);
    count++;
  }

  return count;
}
