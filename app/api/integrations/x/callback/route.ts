import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { exchangeXAdsToken, fetchXAdsAccounts, XAdsApiError } from "@/lib/x/api";

// Codes de raison renvoyés dans /dashboard?x=failed&reason=... (lus par XConnectionNotice).
// missing_params | state_expired | oauth_exchange | missing_user | db_error | ads_<statut HTTP>
export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const url = new URL(request.url);
  const redirect = (status: string, reason?: string) => {
    const target = new URL(`/dashboard?x=${status}`, request.url);
    if (reason) target.searchParams.set("reason", reason);
    return NextResponse.redirect(target);
  };
  const oauthToken = url.searchParams.get("oauth_token") ?? "";
  const verifier = url.searchParams.get("oauth_verifier") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!oauthToken || !verifier) {
    console.error("X Ads OAuth callback: oauth_token/oauth_verifier manquants (autorisation refusée ?)");
    return redirect("failed", "missing_params");
  }

  const { data: stateRows } = await supabase.from("x_ads_oauth_states").select("id,state_hash,request_token,request_token_secret_encrypted,expires_at").eq("user_id", user.id);
  const stateRow = (stateRows ?? []).find((row) => {
    try {
      return row.request_token === oauthToken && (!state || decryptSecret(row.state_hash) === state) && new Date(row.expires_at).getTime() > Date.now();
    } catch {
      return false;
    }
  });
  if (!stateRow) {
    console.error("X Ads OAuth callback: state introuvable ou expiré");
    return redirect("failed", "state_expired");
  }
  await supabase.from("x_ads_oauth_states").delete().eq("id", stateRow.id);

  try {
    const token = await exchangeXAdsToken(oauthToken, decryptSecret(stateRow.request_token_secret_encrypted), verifier);
    if (!token.userId) return redirect("failed", "missing_user");

    // L'appel /accounts peut échouer (401/403) alors que l'OAuth a réussi : on garde l'erreur de X
    // pour la diagnostiquer au lieu de tout perdre.
    let accounts: Awaited<ReturnType<typeof fetchXAdsAccounts>> = [];
    let adsError: XAdsApiError | null = null;
    try {
      accounts = await fetchXAdsAccounts(token.token, token.secret);
    } catch (error) {
      if (error instanceof XAdsApiError) adsError = error;
      else throw error;
    }
    if (adsError) console.error("X Ads accounts request failed", adsError.status, adsError.detail);

    const integration = await supabase.from("x_ads_integrations").upsert({
      user_id: user.id,
      x_user_id: token.userId,
      x_screen_name: token.screenName,
      access_token_encrypted: encryptSecret(token.token),
      access_token_secret_encrypted: encryptSecret(token.secret),
      granted_permissions: ["standard_access_campaign_management_creative"],
      is_active: !adsError,
      last_error: adsError ? `ads_${adsError.status}: ${adsError.detail}`.slice(0, 500) : null,
    }, { onConflict: "user_id,x_user_id" }).select("id").single();
    if (integration.error || !integration.data) {
      console.error("X Ads integration upsert failed", integration.error?.message);
      return redirect("failed", "db_error");
    }
    if (adsError) return redirect("failed", `ads_${adsError.status}`);

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
    return redirect("failed", "oauth_exchange");
  }
}
