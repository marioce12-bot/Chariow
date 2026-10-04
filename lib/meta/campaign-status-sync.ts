import { fetchMetaAccountStatus } from "@/lib/meta/api";
import { getMetaAdReviewStatus, mapMetaEffectiveStatus } from "@/lib/meta/campaigns";
import { isMetaPausedReason, markMetaPausedReason } from "@/lib/meta/status";

type CampaignRow = {
  id: string;
  external_ad_id: string;
  status: string;
  external_error: string | null;
};

type SyncInput = {
  supabase: any;
  accountId: string;
  metaAccountId: string;
  accessToken: string;
  userId?: string;
};

const PAGE_SIZE = 500;
const MAX_CONCURRENT_META_REQUESTS = 5;

function graphAccountId(value: string) {
  return value.startsWith("act_") ? value : `act_${value}`;
}

/** Rafraîchit le account_status stocké et chaque annonce active/en revue ou déjà détectée en pause Meta. */
export async function syncMetaCampaignStatuses(input: SyncInput) {
  const result = {
    accountStatus: null as number | null,
    accountStatusSaved: false,
    checked: 0,
    updated: 0,
    errors: 0,
  };

  try {
    result.accountStatus = await fetchMetaAccountStatus(graphAccountId(input.metaAccountId), input.accessToken);
    let accountUpdate = input.supabase.from("meta_ad_accounts").update({ account_status: result.accountStatus }).eq("id", input.accountId);
    if (input.userId) accountUpdate = accountUpdate.eq("user_id", input.userId);
    const { error } = await accountUpdate;
    if (error) throw error;
    result.accountStatusSaved = true;
  } catch (error) {
    result.errors += 1;
    console.error("Meta account status sync failed", error instanceof Error ? error.message : "unknown error");
  }

  const campaigns: CampaignRow[] = [];
  let offset = 0;
  while (true) {
    let query = input.supabase
      .from("ad_campaigns")
      .select("id,external_ad_id,status,external_error")
      .eq("platform", "meta")
      .eq("meta_ad_account_id", input.accountId)
      .in("status", ["active", "review", "paused"])
      .not("external_ad_id", "is", null);
    if (input.userId) query = query.eq("user_id", input.userId);

    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      result.errors += 1;
      console.error("Meta campaign status query failed", error.message);
      return result;
    }

    const page = (data ?? []) as CampaignRow[];
    campaigns.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const candidates = campaigns.filter((campaign) => campaign.status !== "paused" || isMetaPausedReason(campaign.external_error));
  let nextIndex = 0;
  const workerCount = Math.min(MAX_CONCURRENT_META_REQUESTS, candidates.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < candidates.length) {
      const campaign = candidates[nextIndex++];
      result.checked += 1;
      try {
        const { effectiveStatus, feedback } = await getMetaAdReviewStatus({ adId: campaign.external_ad_id, accessToken: input.accessToken });
        const mapped = mapMetaEffectiveStatus(effectiveStatus, feedback, result.accountStatus);
        if (!mapped) continue;
        const externalError = mapped.status === "paused"
          ? markMetaPausedReason(mapped.error ?? "Meta signale que la publicité est en pause.")
          : mapped.error;
        if (campaign.status === mapped.status && campaign.external_error === externalError) continue;

        let update = input.supabase
          .from("ad_campaigns")
          .update({ status: mapped.status, external_error: externalError })
          .eq("id", campaign.id);
        if (input.userId) update = update.eq("user_id", input.userId);
        const { error: updateError } = await update;
        if (updateError) throw updateError;
        result.updated += 1;
      } catch (error) {
        result.errors += 1;
        console.error("Meta campaign status sync failed", error instanceof Error ? error.message : "unknown error");
      }
    }
  }));

  return result;
}
