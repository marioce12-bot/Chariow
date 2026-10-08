import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const clientId = process.env.PINTEREST_APP_ID;
  const redirectUri = process.env.PINTEREST_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) return NextResponse.json({ error: "Pinterest Ads OAuth n'est pas configuré" }, { status: 500 });
  const state = crypto.randomBytes(32).toString("hex");
  const { error } = await supabase.from("pinterest_oauth_states").insert({ user_id: user.id, state_hash: encryptSecret(state), expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  if (error) return NextResponse.json({ error: "Impossible de préparer la connexion Pinterest Ads" }, { status: 500 });
  const url = new URL("https://www.pinterest.com/oauth/");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "user_accounts:read,ads:read,ads:write,boards:read,boards:write,pins:read,pins:write");
  return NextResponse.redirect(url);
}
