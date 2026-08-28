import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { CHARIOW_MCP_URL } from "@/lib/chariow/types";
import crypto from "node:crypto";

function base64UrlEncode(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function generatePkce() {
  // Ensure length >= 43 chars for code_verifier (required by token endpoint)
  const codeVerifier = base64UrlEncode(crypto.randomBytes(48));
  const hash = crypto.createHash("sha256").update(codeVerifier).digest();
  const codeChallenge = base64UrlEncode(hash);
  return { codeVerifier, codeChallenge };
}

export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const redirectUri = process.env.CHARIOW_OAUTH_REDIRECT_URI;
  const clientId = process.env.CHARIOW_OAUTH_CLIENT_ID;
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "Chariow OAuth n'est pas configuré" }, { status: 500 });
  }

  // Create/update a single Chariow store row for this user.
  const { data: existing, error: findErr } = await supabase
    .from("stores")
    .select("id")
    .eq("user_id", user.id)
    .eq("platform", "chariow")
    .eq("is_active", true)
    .maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

  let storeId: string;
  if (existing?.id) {
    storeId = existing.id;
    const { error: upErr } = await supabase
      .from("stores")
      .update({
        connection_status: "pending",
        connection_error: null,
        mcp_url: CHARIOW_MCP_URL,
      })
      .eq("id", storeId)
      .eq("user_id", user.id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  } else {
    const { data: created, error: createErr } = await supabase
      .from("stores")
      .insert({
        user_id: user.id,
        platform: "chariow",
        store_name: "Chariow boutique",
        mcp_url: CHARIOW_MCP_URL,
        connection_status: "pending",
        connection_error: null,
        is_active: true,
      })
      .select("id")
      .single();
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
    storeId = created.id;
  }

  const state = base64UrlEncode(crypto.randomBytes(32));
  const { codeVerifier, codeChallenge } = generatePkce();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const { error: attemptErr } = await supabase.from("oauth_connection_attempts").insert({
    user_id: user.id,
    platform: "chariow",
    store_id: storeId,
    state,
    code_verifier_encrypted: encryptSecret(codeVerifier),
    expires_at: expiresAt.toISOString(),
  });
  if (attemptErr) return NextResponse.json({ error: attemptErr.message }, { status: 500 });

  const url = new URL("https://mcp.chariow.com/public/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "store:mcp");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(url);
}
