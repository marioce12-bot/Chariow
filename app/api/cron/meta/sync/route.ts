import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveMetaInsightsWindow, syncMetaInsights } from "@/lib/meta/sync";
import { syncMetaCampaignStatuses } from "@/lib/meta/campaign-status-sync";
import { decryptSecret } from "@/lib/crypto";
import { isMetaReconnectRequired, markMetaReconnectRequired } from "@/lib/meta/connection-state";
import { isMetaAuthenticationError } from "@/lib/meta/graph";

const MIN_ACCOUNT_SYNC_INTERVAL_MS = 5 * 60 * 1000;
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  const { data: accounts, error } = await supabase
    .from("meta_ad_accounts")
    .select("id,user_id,meta_integration_id,meta_account_id,access_token_encrypted,last_sync_error,last_synced_at,insights_sync_complete,insights_sync_to")
    .eq("is_active", true)
    .eq("auto_sync_enabled", true)
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<Record<string, unknown>> = [];
  const summary = { accounts: accounts?.length ?? 0, synced: 0, skipped: 0, errors: 0, insightsCalls: 0, rowsRead: 0, rowsWritten: 0 };
  const now = new Date();
  for (const account of accounts ?? []) {
    if (isMetaReconnectRequired(account.last_sync_error)) {
      summary.skipped += 1;
      results.push({ id: account.id, ok: false, skipped: true, reason: "reauth_required" });
      continue;
    }
    const lastSync = account.last_synced_at ? Date.parse(account.last_synced_at) : NaN;
    if (Number.isFinite(lastSync) && now.getTime() - lastSync < MIN_ACCOUNT_SYNC_INTERVAL_MS) {
      summary.skipped += 1;
      results.push({ id: account.id, ok: true, skipped: true, reason: "minimum_interval" });
      continue;
    }

    let campaignStatus: Record<string, unknown> = { campaignInventoryComplete: false, errors: 1 };
    try {
      campaignStatus = await syncMetaCampaignStatuses({
        supabase,
        accountId: account.id,
        metaAccountId: account.meta_account_id,
        accessToken: decryptSecret(account.access_token_encrypted),
      }) as unknown as Record<string, unknown>;
    } catch (error) {
      if (isMetaAuthenticationError(error)) {
        await markMetaReconnectRequired(supabase, account);
        summary.skipped += 1;
        results.push({ id: account.id, ok: false, skipped: true, reason: "reauth_required" });
        continue;
      }
    }
    if (campaignStatus.campaignInventoryComplete === true && Number(campaignStatus.activeCampaigns) === 0) {
      summary.skipped += 1;
      results.push({ id: account.id, ok: true, skipped: true, reason: "no_active_campaign", campaignStatus });
      continue;
    }

    const { from, to } = resolveMetaInsightsWindow(account, now);
    try {
      const stats = await syncMetaInsights(supabase, account, from, to);
      summary.synced += 1;
      summary.insightsCalls += stats.insightsCalls;
      summary.rowsRead += stats.rowsRead;
      summary.rowsWritten += stats.rowsWritten;
      if (stats.errors === 0) await supabase.from("meta_ad_accounts").update({ last_sync_error: null }).eq("id", account.id);
      results.push({ id: account.id, ok: stats.errors === 0, from, to, stats, campaignStatus });
      if (stats.errors) summary.errors += stats.errors;
    } catch (error) {
      if (isMetaAuthenticationError(error)) {
        await markMetaReconnectRequired(supabase, account);
        summary.skipped += 1;
        results.push({ id: account.id, ok: false, skipped: true, reason: "reauth_required" });
        continue;
      }
      const message = error instanceof Error ? error.message.slice(0, 500) : "Meta sync failed";
      summary.errors += 1;
      await supabase.from("meta_ad_accounts").update({ last_sync_error: message }).eq("id", account.id);
      results.push({ id: account.id, ok: false, error: message, campaignStatus });
    }
  }
  console.info("Meta sync summary", summary);
  return NextResponse.json({ results, summary });
}
