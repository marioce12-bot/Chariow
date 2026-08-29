import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncMetaInsights } from "@/lib/meta/sync";

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
  return NextResponse.json({ from, to, results });
}
