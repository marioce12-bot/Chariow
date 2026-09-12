import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { exchangeRedditAuthCode, fetchRedditBusinesses, fetchRedditAdAccounts } from "@/lib/reddit/api";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const url = new URL(request.url);
  const redirect = (status: string) => NextResponse.redirect(new URL(`/dashboard?reddit=${status}`, request.url));
  const state = url.searchParams.get("state") ?? "";
  const { data: stateRows } = await supabase.from("reddit_oauth_states").select("id,state_hash,expires_at").eq("user_id", user.id);
  const stateRow = (stateRows ?? []).find((row) => {
    try { return decryptSecret(row.state_hash) === state && new Date(row.expires_at).getTime() > Date.now(); } catch { return false; }
  });
  if (!stateRow) return redirect("failed");
  await supabase.from("reddit_oauth_states").delete().eq("id", stateRow.id);

  const errorParam = url.searchParams.get("error");
  if (errorParam) {
    console.error("Reddit OAuth denied/error", errorParam);
    return redirect("failed");
  }
  const code = url.searchParams.get("code");
  const redirectUri = process.env.REDDIT_OAUTH_REDIRECT_URI;
  if (!code || !redirectUri) return redirect("failed");

  try {
    const token = await exchangeRedditAuthCode(code, redirectUri);
    if (!token?.access_token) return redirect("failed");
    const integration = await supabase.from("reddit_integrations").upsert({
      user_id: user.id,
      access_token_encrypted: encryptSecret(token.access_token),
      refresh_token_encrypted: token.refresh_token ? encryptSecret(token.refresh_token) : null,
      scope: (token.scope ?? "").split(" ").filter(Boolean),
      is_active: true,
      last_error: null,
    }, { onConflict: "user_id" }).select("id").single();
    if (integration.error || !integration.data) return redirect("failed");

    const businesses = await fetchRedditBusinesses(token.access_token);
    for (const business of businesses) {
      const businessId = String((business as Record<string, unknown>).id ?? "");
      if (!businessId) continue;
      const accounts = await fetchRedditAdAccounts(businessId, token.access_token);
      for (const account of accounts) {
        const row = account as Record<string, unknown>;
        const adAccountId = String(row.id ?? "");
        if (!adAccountId) continue;
        await supabase.from("reddit_ad_accounts").upsert({
          user_id: user.id,
          reddit_integration_id: integration.data.id,
          reddit_business_id: businessId,
          reddit_ad_account_id: adAccountId,
          name: typeof row.name === "string" ? row.name : `Compte ${adAccountId}`,
          currency: typeof row.currency === "string" ? row.currency : "XOF",
          // C'est ce champ qu'on veut observer : approuvé, en attente, ou refusé.
          admin_approval_status: typeof row.admin_approval === "string" ? row.admin_approval : (row.admin_approval ? JSON.stringify(row.admin_approval) : null),
          is_active: true,
        }, { onConflict: "user_id,reddit_ad_account_id" });
      }
    }
    return redirect("connected");
  } catch (error) {
    console.error("Reddit OAuth callback failed", error instanceof Error ? error.message : error);
    return redirect("failed");
  }
}
