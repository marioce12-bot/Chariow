import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { exchangePinterestCode, fetchPinterestAdAccounts } from "@/lib/pinterest/api";
export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const url = new URL(request.url);
  const redirect = (status: string) => NextResponse.redirect(new URL(`/dashboard?pinterest=${status}`, request.url));
  const state = url.searchParams.get("state") ?? "";
  const { data: rows } = await supabase.from("pinterest_oauth_states").select("id,state_hash,expires_at").eq("user_id", user.id);
  const stateRow = (rows ?? []).find((row) => { try { return decryptSecret(row.state_hash) === state && new Date(row.expires_at).getTime() > Date.now(); } catch { return false; } });
  if (!stateRow) return redirect("failed");
  await supabase.from("pinterest_oauth_states").delete().eq("id", stateRow.id);
  const code = url.searchParams.get("code");
  const clientId = process.env.PINTEREST_APP_ID;
  const redirectUri = process.env.PINTEREST_OAUTH_REDIRECT_URI;
  if (!code || !clientId || !redirectUri) return redirect("failed");
  try {
    const token = await exchangePinterestCode(code, redirectUri);
    const meResponse = await fetch("https://api.pinterest.com/v5/user_account", { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
    const me = await meResponse.json().catch(() => ({}));
    const pinterestUserId = typeof me?.id === "string" ? me.id : user.id;
    const integration = await supabase.from("pinterest_integrations").upsert({ user_id: user.id, pinterest_user_id: pinterestUserId, access_token_encrypted: encryptSecret(token.access_token), refresh_token_encrypted: token.refresh_token ? encryptSecret(token.refresh_token) : null, token_expires_at: typeof token.expires_in === "number" ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null, scope: typeof token.scope === "string" ? token.scope.split(/[ ,]+/).filter(Boolean) : [], is_active: true }, { onConflict: "user_id,pinterest_user_id" }).select("id").single();
    if (integration.error || !integration.data) return redirect("failed");
    const accounts = await fetchPinterestAdAccounts(token.access_token);
    for (const account of accounts) {
      const id = String(account.id ?? "");
      if (!/^\d+$/.test(id)) continue;
      await supabase.from("pinterest_ad_accounts").upsert({ user_id: user.id, pinterest_integration_id: integration.data.id, pinterest_ad_account_id: id, name: typeof account.name === "string" ? account.name : `Compte ${id}`, currency: typeof account.currency === "string" ? account.currency : "USD", country: typeof account.country === "string" ? account.country : null, is_active: true }, { onConflict: "user_id,pinterest_ad_account_id" });
    }
    return redirect(accounts.length ? "connected" : "no_ad_account");
  } catch (error) {
    console.error("Pinterest OAuth callback failed", error instanceof Error ? error.message : error);
    return redirect("failed");
  }
}
