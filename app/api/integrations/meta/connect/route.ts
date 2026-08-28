import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const clientId = process.env.META_APP_ID;
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) return NextResponse.json({ error: "Meta Ads OAuth n'est pas configuré" }, { status: 500 });
  const state = crypto.randomBytes(32).toString("hex");
  const { error } = await supabase.from("meta_oauth_states").insert({ user_id: user.id, state_hash: encryptSecret(state), expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  if (error) {
    console.error("Meta OAuth state insert failed", { code: error.code, message: error.message, details: error.details, hint: error.hint });
    return NextResponse.json({ error: "Impossible de préparer la connexion Meta Ads" }, { status: 500 });
  }
  const version = process.env.META_GRAPH_VERSION ?? "v23.0";
  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "ads_read");
  return NextResponse.redirect(url);
}
