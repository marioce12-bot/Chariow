import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncMetaInsights } from "@/lib/meta/sync";
import { syncMetaCampaignStatuses } from "@/lib/meta/campaign-status-sync";
import { decryptSecret } from "@/lib/crypto";

import { isMetaReconnectRequired, markMetaReconnectRequired } from "@/lib/meta/connection-state";
import { isMetaAuthenticationError } from "@/lib/meta/graph";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function accountAlias(accountId: string) {
  return createHash("sha256").update(accountId).digest("hex").slice(0, 16);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data: accounts, error } = await supabase
    .from("meta_ad_accounts")
    .select("id,user_id,meta_integration_id,meta_account_id,access_token_encrypted,last_sync_error")
    .eq("is_active", true)
    .eq("auto_sync_enabled", true)
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<{ id: string; ok: boolean; skipped?: boolean; reason?: string; error?: string; levels?: unknown; campaignStatus?: unknown }> = [];
  let skippedAccounts = 0;
  const logSkippedAccount = (accountId: string) => {
    skippedAccounts += 1;
    console.info("Meta cron account skipped", { accountAlias: accountAlias(accountId), skippedAccounts: 1 });
  };

  for (const account of accounts ?? []) {
    if (isMetaReconnectRequired(account.last_sync_error)) {
      logSkippedAccount(account.id);
      results.push({ id: account.id, ok: false, skipped: true, reason: "reauth_required" });
      continue;
    }
    let levels: unknown;
    let syncError: string | undefined;
    try {
      levels = await syncMetaInsights(supabase, account, from, to);
      await supabase.from("meta_ad_accounts").update({ last_sync_error: null }).eq("id", account.id);
    } catch (error) {
      if (isMetaAuthenticationError(error)) {
        await markMetaReconnectRequired(supabase, account);
        logSkippedAccount(account.id);
        results.push({ id: account.id, ok: false, skipped: true, reason: "reauth_required", error: "Meta Ads doit être reconnecté." });
        continue;
      }
      syncError = error instanceof Error ? error.message.slice(0, 500) : "Meta sync failed";
      await supabase.from("meta_ad_accounts").update({ last_sync_error: syncError }).eq("id", account.id);
    }

    let campaignStatus: unknown;
    try {
      campaignStatus = await syncMetaCampaignStatuses({
        supabase,
        accountId: account.id,
        metaAccountId: account.meta_account_id,
        accessToken: decryptSecret(account.access_token_encrypted),
      });
    } catch (error) {
      if (isMetaAuthenticationError(error)) {
        await markMetaReconnectRequired(supabase, account);
        logSkippedAccount(account.id);
        results.push({ id: account.id, ok: false, skipped: true, reason: "reauth_required", error: "Meta Ads doit être reconnecté." });
        continue;
      }
      campaignStatus = { errors: 1 };
      console.error("Meta status sync failed", error instanceof Error ? error.message : "unknown error");
    }

    results.push({
      id: account.id,
      ok: !syncError,
      ...(syncError ? { error: syncError } : { levels }),
      campaignStatus,
    });
  }

  console.info("Meta cron counters", { skippedAccounts });
  return NextResponse.json({ from, to, results });
}
