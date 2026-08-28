import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { decryptSecret } from "@/lib/crypto";
import { fetchMetaAccounts } from "@/lib/meta/api";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const url = new URL(request.url);
  const redirect = (status: string) => NextResponse.redirect(new URL(`/dashboard?meta=${status}`, request.url));
  const state = url.searchParams.get("state") ?? "";
  const { data: stateRows } = await supabase.from("meta_oauth_states").select("id,state_hash,expires_at").eq("user_id", user.id);
  const stateRow = (stateRows ?? []).find((row) => {
    try { return decryptSecret(row.state_hash) === state && new Date(row.expires_at).getTime() > Date.now(); } catch { return false; }
  });
  if (!stateRow) return redirect("failed");
  await supabase.from("meta_oauth_states").delete().eq("id", stateRow.id);
  const code = url.searchParams.get("code");
  if (!code) return redirect("failed");
  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return redirect("failed");

  try {
    const tokenUrl = new URL("https://graph.facebook.com/v23.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", clientId);
    tokenUrl.searchParams.set("client_secret", clientSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);
    const tokenResponse = await fetch(tokenUrl, { cache: "no-store" });
    const token = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || typeof token.access_token !== "string") return redirect("failed");
    const accounts = await fetchMetaAccounts(token.access_token);
    const meResponse = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v23.0"}/me?fields=id&access_token=${encodeURIComponent(token.access_token)}`, { cache: "no-store" });
    const me = await meResponse.json().catch(() => ({}));
    const integration = await supabase.from("meta_integrations").upsert({
      user_id: user.id,
      meta_user_id: typeof me?.id === "string" ? me.id : user.id,
      access_token_encrypted: encryptSecret(token.access_token),
      token_expires_at: typeof token.expires_in === "number" ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
      granted_scopes: ["ads_read"],
      is_active: true,
      last_error: null,
    }, { onConflict: "user_id,meta_user_id" }).select("id").single();
    if (integration.error || !integration.data) return redirect("failed");
    for (const account of accounts) {
      const metaAccountId = String(account.id ?? "");
      if (!metaAccountId) continue;
      await supabase.from("meta_ad_accounts").upsert({
        user_id: user.id,
        meta_integration_id: integration.data.id,
        meta_account_id: metaAccountId.replace(/^act_/, ""),
        name: typeof account.name === "string" ? account.name : `Compte ${metaAccountId}`,
        currency: typeof account.currency === "string" ? account.currency : "XOF",
        access_token_encrypted: encryptSecret(token.access_token),
        token_expires_at: typeof token.expires_in === "number" ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
        is_active: true,
        is_selected: true,
      }, { onConflict: "user_id,meta_account_id" });
    }
    return redirect("connected");
  } catch (error) {
    console.error("Meta OAuth callback failed", error instanceof Error ? error.message : error);
    return redirect("failed");
  }
}
