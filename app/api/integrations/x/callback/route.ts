import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { exchangeXAdsToken, fetchXAdsAccounts } from "@/lib/x/api";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const url = new URL(request.url);
  const redirect = (status: string) => NextResponse.redirect(new URL(`/dashboard?x=${status}`, request.url));
  const oauthToken = url.searchParams.get("oauth_token") ?? "";
  const verifier = url.searchParams.get("oauth_verifier") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!oauthToken || !verifier) return redirect("failed");

  const { data: stateRows } = await supabase.from("x_ads_oauth_states").select("id,state_hash,request_token,request_token_secret_encrypted,expires_at").eq("user_id", user.id);
  const stateRow = (stateRows ?? []).find((row) => {
    try {
      return row.request_token === oauthToken && (!state || decryptSecret(row.state_hash) === state) && new Date(row.expires_at).getTime() > Date.now();
    } catch {
      return false;
    }
  });
  if (!stateRow) return redirect("failed");
  await supabase.from("x_ads_oauth_states").delete().eq("id", stateRow.id);

  try {
    const token = await exchangeXAdsToken(oauthToken, decryptSecret(stateRow.request_token_secret_encrypted), verifier);
    const accounts = await fetchXAdsAccounts(token.token, token.secret);
    if (!token.userId) return redirect("failed");
    const integration = await supabase.from("x_ads_integrations").upsert({
      user_id: user.id,
      x_user_id: token.userId,
      x_screen_name: token.screenName,
      access_token_encrypted: encryptSecret(token.token),
      access_token_secret_encrypted: encryptSecret(token.secret),
      granted_permissions: ["standard_access_campaign_management_creative"],
      is_active: true,
      last_error: null,
    }, { onConflict: "user_id,x_user_id" }).select("id").single();
    if (integration.error || !integration.data) return redirect("failed");

    for (const account of accounts) {
      if (!account.id) continue;
      await supabase.from("x_ads_accounts").upsert({
        user_id: user.id,
        x_ads_integration_id: integration.data.id,
        x_account_id: account.id,
        name: account.name ?? `Compte ${account.id}`,
        currency: account.currency ?? "XOF",
        timezone: account.timezone ?? null,
        approval_status: account.approval_status ?? null,
        is_active: true,
      }, { onConflict: "user_id,x_account_id" });
    }
    return redirect(accounts.length ? "connected" : "no_ad_account");
  } catch (error) {
    console.error("X Ads OAuth callback failed", error instanceof Error ? error.message : error);
    return redirect("failed");
  }
}
