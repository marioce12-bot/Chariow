import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { REDDIT_OAUTH_AUTHORIZE_URL } from "@/lib/reddit/api";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const appId = process.env.REDDIT_APP_ID;
  const redirectUri = process.env.REDDIT_OAUTH_REDIRECT_URI;
  if (!appId || !redirectUri) return NextResponse.json({ error: "Reddit Ads OAuth n'est pas configuré" }, { status: 500 });
  const state = crypto.randomBytes(32).toString("hex");
  const { error } = await supabase.from("reddit_oauth_states").insert({ user_id: user.id, state_hash: encryptSecret(state), expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  if (error) {
    console.error("Reddit OAuth state insert failed", { code: error.code, message: error.message });
    return NextResponse.json({ error: "Impossible de préparer la connexion Reddit Ads" }, { status: 500 });
  }
  const url = new URL(REDDIT_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  // permanent = on reçoit un refresh_token (sinon le token expire en 1h sans recours).
  url.searchParams.set("duration", "permanent");
  // Scopes à confirmer dans le Developer Portal de l'app une fois créée : les docs
  // tierces divergent entre "adsread"/"adsedit" et "ads:read"/"ads:manage".
  url.searchParams.set("scope", process.env.REDDIT_OAUTH_SCOPES ?? "adsread adsedit");
  return NextResponse.redirect(url);
}
