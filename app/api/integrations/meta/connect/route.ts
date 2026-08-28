import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  const { user, response } = await requireUser();
  if (!user) return response;
  const clientId = process.env.META_APP_ID;
  const redirectUri = process.env.META_OAUTH_REDIRECT_URI;
  if (!clientId || !redirectUri) return NextResponse.json({ error: "Meta Ads OAuth n'est pas configuré" }, { status: 500 });
  const state = `${user.id}.${crypto.randomBytes(24).toString("base64url")}`;
  const url = new URL("https://www.facebook.com/v23.0/dialog/oauth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "ads_read,business_management");
  return NextResponse.redirect(url);
}
