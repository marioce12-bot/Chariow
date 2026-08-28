import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { fetchMetaAccounts } from "@/lib/meta/api";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const url = new URL(request.url);
  const redirect = (status: string) => NextResponse.redirect(new URL(`/dashboard?meta=${status}`, request.url));
  const state = url.searchParams.get("state") ?? "";
  if (!state.startsWith(`${user.id}.`)) return redirect("failed");
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
    for (const account of accounts) {
      const metaAccountId = String(account.id ?? "");
      if (!metaAccountId) continue;
      await supabase.from("meta_ad_accounts").upsert({
        user_id: user.id,
        meta_account_id: metaAccountId.replace(/^act_/, ""),
        name: typeof account.name === "string" ? account.name : `Compte ${metaAccountId}`,
        currency: typeof account.currency === "string" ? account.currency : "XOF",
        access_token_encrypted: encryptSecret(token.access_token),
        token_expires_at: typeof token.expires_in === "number" ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null,
        is_active: true,
      }, { onConflict: "user_id,meta_account_id" });
    }
    return redirect("connected");
  } catch (error) {
    console.error("Meta OAuth callback failed", error instanceof Error ? error.message : error);
    return redirect("failed");
  }
}
