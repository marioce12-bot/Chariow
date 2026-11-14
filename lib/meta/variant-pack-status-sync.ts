import { buildPackMetaState, isTerminalPackMetaState, syncLinkedStandardCampaignStatus, unavailablePackMetaState, withPackMetaState } from "@/lib/ad-variant-pack-lifecycle";
import { createPackMetaLifecycleOperations, type PackMetaLifecycleInput } from "@/lib/ad-variant-pack-meta-lifecycle";
import { isMetaAuthenticationError } from "@/lib/meta/graph";

const MAX_PACKS_PER_ACCOUNT_PER_SYNC = 10;
const PACK_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const MAX_PACKS_TO_READ = 100;

type SyncAccount = {
  id: string;
  user_id: string;
  meta_account_id: string;
  account_status?: number | null;
};

type PackRow = PackMetaLifecycleInput & {
  id: string;
  user_id: string;
  status: string;
  updated_at: string;
  checkpoints: Record<string, unknown> | null;
  created_at?: string;
};

function lastSyncedAt(row: PackRow): number {
  const value = (row.checkpoints?.meta_state as Record<string, unknown> | null)?.synced_at;
  const parsed = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function syncMetaVariantPackStatuses(input: {
  supabase: any;
  account: SyncAccount;
  accessToken: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const { data, error } = await input.supabase
    .from("ad_variant_packs")
    .select("id,user_id,status,meta_ad_account_id,external_campaign_id,checkpoints,updated_at,created_at")
    .eq("user_id", input.account.user_id)
    .eq("meta_ad_account_id", input.account.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(MAX_PACKS_TO_READ);
  if (error) throw new Error("Impossible de charger les Packs pour la synchronisation Meta.");

  const eligible = ((data ?? []) as PackRow[])
    .filter((pack) => pack.checkpoints?.activated === true && typeof pack.updated_at === "string")
    .filter((pack) => !isTerminalPackMetaState(pack.checkpoints?.meta_state))
    .filter((pack) => now.getTime() - lastSyncedAt(pack) >= PACK_SYNC_INTERVAL_MS)
    .sort((a, b) => lastSyncedAt(a) - lastSyncedAt(b) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))
    .slice(0, MAX_PACKS_PER_ACCOUNT_PER_SYNC);

  let synced = 0;
  let errors = 0;
  for (const pack of eligible) {
    const syncedAt = now.toISOString();
    let metaState;
    try {
      const operations = createPackMetaLifecycleOperations({
        pack,
        accessToken: input.accessToken,
        metaAccountId: input.account.meta_account_id,
        accountStatus: input.account.account_status,
      });
      metaState = buildPackMetaState(await operations.read(), syncedAt);
    } catch (error) {
      if (isMetaAuthenticationError(error)) throw error;
      metaState = unavailablePackMetaState(syncedAt, "Impossible de confirmer le statut actuel de cette campagne chez Meta.");
      errors += 1;
    }

    const { data: saved, error: saveError } = await input.supabase
      .from("ad_variant_packs")
      .update({ checkpoints: withPackMetaState(pack.checkpoints, metaState), updated_at: syncedAt })
      .eq("id", pack.id)
      .eq("user_id", input.account.user_id)
      .eq("updated_at", pack.updated_at)
      .select("id")
      .maybeSingle();
    if (saveError || !saved) {
      errors += 1;
      continue;
    }
    synced += 1;
    try {
      await syncLinkedStandardCampaignStatus({
        client: input.supabase,
        userId: input.account.user_id,
        metaAdAccountId: pack.meta_ad_account_id,
        externalCampaignId: operationsCampaignId(pack),
        status: metaState.status,
      });
    } catch {
      errors += 1;
    }
  }

  return { eligible: eligible.length, synced, errors, skipped: Math.max(0, (data ?? []).length - eligible.length) };
}

function operationsCampaignId(pack: PackRow) {
  return pack.external_campaign_id || pack.checkpoints?.campaignId || "";
}
