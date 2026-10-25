export const META_REAUTH_REQUIRED_PREFIX = "META_REAUTH_REQUIRED:";
export const META_REAUTH_REQUIRED_MESSAGE = `${META_REAUTH_REQUIRED_PREFIX}Meta Ads access token is invalid or expired; reconnect required.`;

export function isMetaReconnectRequired(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(META_REAUTH_REQUIRED_PREFIX);
}

type MetaReconnectAccount = { id: string; meta_integration_id?: string | null };

/** Marks the account and its sibling accounts without changing connection activity or user settings. */
export async function markMetaReconnectRequired(
  supabase: any,
  account: MetaReconnectAccount,
  userId?: string,
): Promise<void> {
  let accountQuery = supabase
    .from("meta_ad_accounts")
    .update({ last_sync_error: META_REAUTH_REQUIRED_MESSAGE })
    .eq("id", account.id);
  if (userId) accountQuery = accountQuery.eq("user_id", userId);
  const { error: accountError } = await accountQuery;
  if (accountError) throw accountError;

  if (!account.meta_integration_id) return;
  let siblingsQuery = supabase
    .from("meta_ad_accounts")
    .update({ last_sync_error: META_REAUTH_REQUIRED_MESSAGE })
    .eq("meta_integration_id", account.meta_integration_id);
  let integrationQuery = supabase
    .from("meta_integrations")
    .update({ last_error: META_REAUTH_REQUIRED_MESSAGE })
    .eq("id", account.meta_integration_id);
  if (userId) {
    siblingsQuery = siblingsQuery.eq("user_id", userId);
    integrationQuery = integrationQuery.eq("user_id", userId);
  }
  const [{ error: siblingsError }, { error: integrationError }] = await Promise.all([siblingsQuery, integrationQuery]);
  if (siblingsError) throw siblingsError;
  if (integrationError) throw integrationError;
}
