import { toUsd } from "@/lib/currency";

export type HomeProfitCampaign = {
  platform?: string | null;
  product_id?: string | null;
  external_campaign_id?: string | null;
  meta_ad_account_id?: string | null;
  tiktok_ad_account_id?: string | null;
  pinterest_ad_account_id?: string | null;
};

export type CampaignSpendReport = {
  platform: string;
  accountId: string;
  ok: boolean;
  stale?: boolean;
  convertible: boolean;
  campaigns: Array<{ id: string; spendUsd: number | null }>;
};

export type CampaignSpendTotal = {
  spendUsd: number | null;
  complete: boolean;
  campaignCount: number;
};

const PLATFORMS = new Set(["meta", "tiktok", "pinterest"]);

function accountIdFor(campaign: HomeProfitCampaign) {
  if (campaign.platform === "meta") return campaign.meta_ad_account_id?.trim() || null;
  if (campaign.platform === "tiktok") return campaign.tiktok_ad_account_id?.trim() || null;
  if (campaign.platform === "pinterest") return campaign.pinterest_ad_account_id?.trim() || null;
  return null;
}

/**
 * Totalise une seule fois les campagnes publicitaires Vendeo associées à un produit.
 * Les rapports sont déjà ramenés en USD; une lecture absente, échouée ou périmée
 * rend le total incomplet, plutôt que de transformer une dépense inconnue en zéro.
 */
export function calculateProductCampaignSpendUsd(
  campaigns: HomeProfitCampaign[],
  reports: CampaignSpendReport[],
): CampaignSpendTotal {
  const tracked = new Map<string, { platform: string; accountId: string | null; campaignId: string }>();
  for (const campaign of campaigns) {
    const platform = campaign.platform?.trim().toLowerCase() ?? "";
    const campaignId = campaign.external_campaign_id?.trim() ?? "";
    if (!campaign.product_id?.trim() || !campaignId) continue;
    const accountId = PLATFORMS.has(platform) ? accountIdFor({ ...campaign, platform }) : null;
    const key = `${platform}:${accountId ?? "missing-account"}:${campaignId}`;
    tracked.set(key, { platform, accountId, campaignId });
  }

  if (!tracked.size) return { spendUsd: 0, complete: true, campaignCount: 0 };

  const reportByAccount = new Map(reports.map((report) => [`${report.platform}:${report.accountId}`, report]));
  let total = 0;
  let complete = true;
  for (const campaign of tracked.values()) {
    if (!PLATFORMS.has(campaign.platform) || !campaign.accountId) {
      complete = false;
      continue;
    }
    const report = reportByAccount.get(`${campaign.platform}:${campaign.accountId}`);
    if (!report?.ok || report.stale || !report.convertible) {
      complete = false;
      continue;
    }
    for (const reportedCampaign of report.campaigns) {
      if (reportedCampaign.id !== campaign.campaignId) continue;
      if (reportedCampaign.spendUsd === null || !Number.isFinite(reportedCampaign.spendUsd)) {
        complete = false;
      } else {
        total += reportedCampaign.spendUsd;
      }
    }
  }

  return {
    spendUsd: complete ? Math.round((total + Number.EPSILON) * 100) / 100 : null,
    complete,
    campaignCount: tracked.size,
  };
}

/** Calcule les bénéfices nets en USD, en partant du revenu déjà après frais Chariow. */
export function calculateHomeNetProfitUsd(input: {
  revenueAfterChariowFees: number | null | undefined;
  revenueCurrency: string;
  campaignSpendUsd: number | null | undefined;
  campaignSpendComplete: boolean;
}): number | null {
  if (!input.campaignSpendComplete || input.revenueAfterChariowFees == null || input.campaignSpendUsd == null) return null;
  if (!Number.isFinite(input.revenueAfterChariowFees) || !Number.isFinite(input.campaignSpendUsd)) return null;
  const revenueUsd = toUsd(input.revenueAfterChariowFees, input.revenueCurrency);
  if (revenueUsd === null) return null;
  return Math.round((revenueUsd - input.campaignSpendUsd + Number.EPSILON) * 100) / 100;
}
