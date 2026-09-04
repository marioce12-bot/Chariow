import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const appId = process.env.TIKTOK_APP_ID;
  const redirectUri = process.env.TIKTOK_OAUTH_REDIRECT_URI;
  if (!appId || !redirectUri) return NextResponse.json({ error: "TikTok Ads OAuth n'est pas configuré" }, { status: 500 });
  const state = crypto.randomBytes(32).toString("hex");
  const { error } = await supabase.from("tiktok_oauth_states").insert({ user_id: user.id, state_hash: encryptSecret(state), expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  if (error) {
    console.error("TikTok OAuth state insert failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Impossible de préparer la connexion TikTok Ads" }, { status: 500 });
  }
  const url = new URL("https://business-api.tiktok.com/portal/auth");
  url.searchParams.set("app_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
