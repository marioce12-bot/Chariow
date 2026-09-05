import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncMetaInsights } from "@/lib/meta/sync";
import { decryptSecret } from "@/lib/crypto";
import { getMetaAdReviewStatus, mapMetaEffectiveStatus } from "@/lib/meta/campaigns";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createAdminClient();
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data: accounts, error } = await supabase.from("meta_ad_accounts").select("id,meta_account_id,access_token_encrypted").eq("is_active", true).eq("auto_sync_enabled", true).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const account of accounts ?? []) {
    try {
      const synced = await syncMetaInsights(supabase, account, from, to);
      await supabase.from("meta_ad_accounts").update({ last_sync_error: null }).eq("id", account.id);
      results.push({ id: account.id, ok: true, ...(synced ? { levels: synced } : {}) });
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message.slice(0, 500) : "Meta sync failed";
      await supabase.from("meta_ad_accounts").update({ last_sync_error: message }).eq("id", account.id);
      results.push({ id: account.id, ok: false, error: message });
    }
  }

  const { data: pendingCampaigns } = await supabase
    .from("ad_campaigns")
    .select("id,external_ad_id,meta_ad_account_id")
    .eq("platform", "meta")
    .eq("status", "review")
    .not("external_ad_id", "is", null)
    .limit(200);
  for (const campaign of pendingCampaigns ?? []) {
    const { data: account } = await supabase.from("meta_ad_accounts").select("access_token_encrypted").eq("id", campaign.meta_ad_account_id).maybeSingle();
    if (!account) continue;
    try {
      const accessToken = decryptSecret(account.access_token_encrypted);
      const { effectiveStatus, feedback } = await getMetaAdReviewStatus({ adId: campaign.external_ad_id, accessToken });
      const mapped = mapMetaEffectiveStatus(effectiveStatus, feedback);
      if (mapped) await supabase.from("ad_campaigns").update({ status: mapped.status, external_error: mapped.error }).eq("id", campaign.id);
    } catch {
      // on retentera au prochain passage du cron
    }
  }

  return NextResponse.json({ from, to, results });
}
