import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { syncMetaCampaignStatuses } from "@/lib/meta/campaign-status-sync";
import { syncMetaInsights } from "@/lib/meta/sync";

export async function POST(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const body = await request.json().catch(() => null);
  const accountId = typeof body?.account_id === "string" ? body.account_id : null;
  const from = typeof body?.from === "string" ? body.from : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const to = typeof body?.to === "string" ? body.to : new Date().toISOString().slice(0, 10);
  const query = supabase.from("meta_ad_accounts").select("id,meta_account_id,access_token_encrypted").eq("user_id", user.id).eq("is_active", true);
  const { data: account, error } = await (accountId ? query.eq("id", accountId).maybeSingle() : query.limit(1).maybeSingle());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!account) return NextResponse.json({ error: "Aucun compte Meta Ads connecté" }, { status: 404 });

  let campaignStatus: unknown;
  try {
    campaignStatus = await syncMetaCampaignStatuses({
      supabase,
      accountId: account.id,
      metaAccountId: account.meta_account_id,
      accessToken: decryptSecret(account.access_token_encrypted),
      userId: user.id,
    });
  } catch (statusError) {
    campaignStatus = { errors: 1 };
    console.error("Meta status sync failed", statusError instanceof Error ? statusError.message : "unknown error");
  }

  try {
    const synced = await syncMetaInsights(supabase, account, from, to);
    await supabase.from("meta_ad_accounts").update({ last_sync_error: null }).eq("id", account.id).eq("user_id", user.id);
    return NextResponse.json({ synced, campaignStatus, from, to });
  } catch (syncError) {
    const message = syncError instanceof Error ? syncError.message.slice(0, 500) : "Meta sync failed";
    await supabase.from("meta_ad_accounts").update({ last_sync_error: message }).eq("id", account.id).eq("user_id", user.id);
    console.error("Meta insights sync failed", message);
    return NextResponse.json({ error: "La synchronisation Meta Ads a échoué", campaignStatus }, { status: 502 });
  }
}
