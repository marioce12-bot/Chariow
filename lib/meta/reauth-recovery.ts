import { encryptSecret } from "@/lib/crypto";
import { fetchMetaAccountStatus } from "./api";
import { isMetaReconnectRequired, META_REAUTH_REQUIRED_PREFIX } from "./connection-state";

type ReauthMarkedAccount = {
  id: string;
  meta_account_id: string;
  last_sync_error: string | null;
};

type RecoveryOptions = {
  supabase: any;
  userId: string;
  integrationId: string;
  returnedAccountIds: string[];
  accessToken: string;
  tokenExpiresAt: string | null;
};

function normalizeAccountId(value: unknown): string {
  return String(value ?? "").replace(/^act_/, "");
}

/**
 * OAuth's account list can omit an older account even when the new token still
 * has access to it. Keep its reconnect marker until a targeted Graph request for
 * that exact account succeeds, then save the new credential and clear the marker.
 */
export async function recoverUnlistedMetaAccountReconnects({
  supabase,
  userId,
  integrationId,
  returnedAccountIds,
  accessToken,
  tokenExpiresAt,
}: RecoveryOptions): Promise<{ verified: number; failed: number }> {
  const { data, error } = await supabase
    .from("meta_ad_accounts")
    .select("id,meta_account_id,last_sync_error")
    .eq("user_id", userId)
    .eq("meta_integration_id", integrationId)
    .like("last_sync_error", `${META_REAUTH_REQUIRED_PREFIX}%`);

  if (error) throw error;

  const returnedIds = new Set(returnedAccountIds.map(normalizeAccountId));
  const candidates = ((data ?? []) as ReauthMarkedAccount[]).filter((account) =>
    isMetaReconnectRequired(account.last_sync_error) &&
    normalizeAccountId(account.meta_account_id) !== "" &&
    !returnedIds.has(normalizeAccountId(account.meta_account_id)),
  );

  const outcomes = await Promise.all(candidates.map(async (account) => {
    const accountId = normalizeAccountId(account.meta_account_id);
    try {
      const accountStatus = await fetchMetaAccountStatus(accountId, accessToken);
      if (!Number.isInteger(accountStatus) || accountStatus <= 0) {
        throw new Error("Meta n’a pas renvoyé un account_status valide");
      }
      const { data: updatedAccount, error: updateError } = await supabase
        .from("meta_ad_accounts")
        .update({
          access_token_encrypted: encryptSecret(accessToken),
          token_expires_at: tokenExpiresAt,
          last_sync_error: null,
        })
        .eq("id", account.id)
        .eq("user_id", userId)
        .eq("meta_integration_id", integrationId)
        .eq("last_sync_error", account.last_sync_error)
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updatedAccount?.id) throw new Error("Le compte ou son marqueur a changé avant la mise à jour");
      return true;
    } catch (error) {
      console.warn("Meta OAuth: ancien compte non vérifié, marqueur conservé", {
        account: accountId,
        reason: error instanceof Error ? error.message : "unknown",
      });
      return false;
    }
  }));

  return {
    verified: outcomes.filter(Boolean).length,
    failed: outcomes.filter((outcome) => !outcome).length,
  };
}
