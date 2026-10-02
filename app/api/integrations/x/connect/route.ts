import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { requestXAdsToken, xAuthorizeUrl } from "@/lib/x/api";

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  if (!process.env.X_API_KEY || !process.env.X_API_SECRET || !process.env.X_ADS_OAUTH_REDIRECT_URI) {
    return NextResponse.json({ error: "X Ads OAuth n'est pas configuré" }, { status: 500 });
  }
  try {
    const state = crypto.randomBytes(32).toString("hex");
    const requestToken = await requestXAdsToken();
    const { error } = await supabase.from("x_ads_oauth_states").insert({
      user_id: user.id,
      state_hash: encryptSecret(state),
      request_token: requestToken.token,
      request_token_secret_encrypted: encryptSecret(requestToken.secret),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error(error.message);
    const url = new URL(xAuthorizeUrl(requestToken.token));
    url.searchParams.set("state", state);
    return NextResponse.redirect(url);
  } catch (error) {
    console.error("X Ads OAuth start failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Impossible de préparer la connexion X Ads" }, { status: 500 });
  }
}
