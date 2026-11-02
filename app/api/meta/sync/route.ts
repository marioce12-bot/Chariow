import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { syncMetaCampaignStatuses } from "@/lib/meta/campaign-status-sync";
import { resolveMetaInsightsWindow, syncMetaInsights } from "@/lib/meta/sync";

import { isMetaReconnectRequired, markMetaReconnectRequired } from "@/lib/meta/connection-state";
import { isMetaAuthenticationError } from "@/lib/meta/graph";

const RECONNECT_RESPONSE = { error: "La connexion Meta Ads doit être refaite.", needs_reconnect: true };
const MIN_ACCOUNT_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const accountId = typeof body?.account_id === "string" ? body.account_id : null;
  const requestedFrom = typeof body?.from === "string" ? body.from : null;
  const requestedTo = typeof body?.to === "string" ? body.to : null;
  if ((requestedFrom && !ISO_DATE.test(requestedFrom)) || (requestedTo && !ISO_DATE.test(requestedTo)) || Boolean(requestedFrom) !== Boolean(requestedTo))
    return NextResponse.json({ error: "Période de synchronisation invalide." }, { status: 400 });
  const query = supabase.from("meta_ad_accounts").select("id,meta_integration_id,meta_account_id,access_token_encrypted,last_sync_error,last_synced_at,insights_sync_complete,insights_sync_to").eq("user_id", user.id).eq("is_active", true);
  const { data: account, error } = await (accountId ? query.eq("id", accountId).maybeSingle() : query.limit(1).maybeSingle());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Aucun compte Meta Ads connecté" }, { status: 404 });
  if (isMetaReconnectRequired(account.last_sync_error)) return NextResponse.json(RECONNECT_RESPONSE, { status: 409 });
  const lastSync = account.last_synced_at ? Date.parse(account.last_synced_at) : NaN;
  const waitMs = Number.isFinite(lastSync) ? MIN_ACCOUNT_SYNC_INTERVAL_MS - (Date.now() - lastSync) : 0;
  if (waitMs > 0) return NextResponse.json({ error: "Ce compte Meta vient d’être synchronisé. Réessaie après le délai minimum.", retry_after_seconds: Math.ceil(waitMs / 1000) }, { status: 429 });

  // The browser/session client is intentionally retained for ownership checks
  // above. The sync itself is a trusted server operation: meta_insights_daily
  // has no user INSERT/UPDATE policy, so using the session client causes a
  // 42501 RLS failure and makes the sync retry the same Meta data repeatedly.
  const syncClient = createAdminClient();

  let campaignStatus: unknown;
  try {
    campaignStatus = await syncMetaCampaignStatuses({
      supabase: syncClient,
      accountId: account.id,
      metaAccountId: account.meta_account_id,
      accessToken: decryptSecret(account.access_token_encrypted),
      userId: user.id,
    });
  } catch (statusError) {
    if (isMetaAuthenticationError(statusError)) {
      await markMetaReconnectRequired(supabase, account, user.id);
      return NextResponse.json(RECONNECT_RESPONSE, { status: 409 });
    }
    campaignStatus = { errors: 1 };
  }

  try {
    const { from, to } = resolveMetaInsightsWindow(account, new Date(), { from: requestedFrom, to: requestedTo, resync: body?.resync === true });
    const synced = await syncMetaInsights(syncClient, account, from, to);
    const statusErrors = Number((campaignStatus as { errors?: number } | null)?.errors ?? 0);
    console.info("Meta sync summary", { accounts: 1, synced: 1, errors: synced.errors + statusErrors, insightsCalls: synced.insightsCalls, rowsRead: synced.rowsRead, rowsWritten: synced.rowsWritten });
    if (synced.errors === 0) await supabase.from("meta_ad_accounts").update({ last_sync_error: null }).eq("id", account.id).eq("user_id", user.id);
    return NextResponse.json({ synced, campaignStatus, from, to });
  } catch (syncError) {
    if (isMetaAuthenticationError(syncError)) {
      await markMetaReconnectRequired(supabase, account, user.id);
      return NextResponse.json(RECONNECT_RESPONSE, { status: 409 });
    }
    const message = syncError instanceof Error ? syncError.message.slice(0, 500) : "Meta sync failed";
    await supabase.from("meta_ad_accounts").update({ last_sync_error: message }).eq("id", account.id).eq("user_id", user.id);
    console.info("Meta sync summary", { accounts: 1, synced: 0, errors: 1, insightsCalls: 1, rowsRead: 0, rowsWritten: 0 });
    return NextResponse.json({ error: "La synchronisation Meta Ads a échoué", campaignStatus }, { status: 502 });
  }
}
