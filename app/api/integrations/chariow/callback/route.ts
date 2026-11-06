import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { ChariowMcpClient } from "@/lib/chariow/mcp-client";
import { CHARIOW_MCP_URL } from "@/lib/chariow/types";
import { invalidateUserStoreList } from "@/lib/shop/cache";
import { updateBrevoContact } from "@/lib/email";

const STATUS_COOKIE = "vendeo_chariow_status";

function sanitizeErrorMessage(message: string) {
  // Remove potential sensitive payload and keep it short.
  const cleaned = message.replace(/([A-Za-z0-9_-]{20,})/g, "[redacted]");
  return cleaned.slice(0, 220);
}

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const redirectToDashboard = (query: string) => NextResponse.redirect(new URL(`/dashboard?${query}`, request.url));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");

  const redirectUri = process.env.CHARIOW_OAUTH_REDIRECT_URI;
  if (!redirectUri) {
    console.error("Chariow OAuth production variables are missing");
    return redirectToDashboard("chariow=failed");
  }

  if (!state) {
    return redirectToDashboard("chariow=failed");
  }

  const { data: attempt, error: attemptErr } = await supabase
    .from("oauth_connection_attempts")
    .select("store_id, code_verifier_encrypted, oauth_client_id, expires_at")
    .eq("user_id", user.id)
    .eq("state", state)
    .maybeSingle();

  const storeId = attempt?.store_id ? String(attempt.store_id) : null;

  if (attemptErr || !storeId) {
    console.error("Chariow OAuth attempt lookup failed", attemptErr?.message ?? "missing store_id");
    return redirectToDashboard("chariow=failed");
  }

  if (!attempt) {
    return redirectToDashboard("chariow=failed");
  }
  const oauthClientId = typeof attempt.oauth_client_id === "string" ? attempt.oauth_client_id : null;
  if (!oauthClientId) {
    await supabase.from("stores").update({ connection_status: "failed", connection_error: "Tentative OAuth invalide. Recommence la connexion.", last_verified_at: new Date().toISOString() }).eq("id", storeId).eq("user_id", user.id);
    invalidateUserStoreList(user.id);
    return redirectToDashboard("chariow=failed");
  }

  const now = new Date();
  const exp = new Date(attempt.expires_at);
  if (!(exp.getTime() > now.getTime())) {
    // OAuth state expired: treat as a failed connection request (not as MCP token expired).
    await supabase
      .from("stores")
      .update({
        connection_status: "failed",
        connection_error: "La demande de connexion a expiré. Recommence la connexion.",
        last_verified_at: now.toISOString(),
      })
      .eq("id", storeId)
      .eq("user_id", user.id);
    invalidateUserStoreList(user.id);
    await supabase.from("oauth_connection_attempts").delete().eq("state", state).eq("user_id", user.id);
    return redirectToDashboard("chariow=failed");
  }

  if (oauthError) {
    const message = sanitizeErrorMessage(`${oauthError}: ${oauthErrorDescription ?? ""}`);
    await supabase
      .from("stores")
      .update({ connection_status: "failed", connection_error: message, last_verified_at: now.toISOString() })
      .eq("id", storeId)
      .eq("user_id", user.id);
    invalidateUserStoreList(user.id);
    if (oauthError !== "access_denied") console.error("Chariow OAuth authorization failed", message);
    return redirectToDashboard("chariow=failed");
  }

  if (!code) {
    await supabase
      .from("stores")
      .update({ connection_status: "failed", connection_error: "Connexion Chariow incomplète", last_verified_at: now.toISOString() })
      .eq("id", storeId)
      .eq("user_id", user.id);
    invalidateUserStoreList(user.id);
    return redirectToDashboard("chariow=failed");
  }

  try {
    const codeVerifier = decryptSecret(attempt.code_verifier_encrypted);

    // Exchange authorization code -> access_token
    const tokenResp = await fetch("https://mcp.chariow.com/public/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: oauthClientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    const tokenJson = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok) {
      const tech = typeof tokenJson?.error_description === "string" ? tokenJson.error_description : tokenResp.statusText;
      const message = sanitizeErrorMessage(`OAuth token exchange failed: ${tech}`);
      await supabase
        .from("stores")
        .update({ connection_status: "failed", connection_error: message, last_verified_at: now.toISOString() })
        .eq("id", storeId)
        .eq("user_id", user.id);
      invalidateUserStoreList(user.id);
      console.error("Chariow OAuth token exchange failed", tokenResp.status, message);
      return redirectToDashboard("chariow=failed");
    }

    const accessToken = tokenJson?.access_token;
    if (typeof accessToken !== "string" || !accessToken) {
      await supabase
        .from("stores")
        .update({ connection_status: "failed", connection_error: "Réponse OAuth invalide", last_verified_at: now.toISOString() })
        .eq("id", storeId)
        .eq("user_id", user.id);
      invalidateUserStoreList(user.id);
      return redirectToDashboard("chariow=failed");
    }

    const tokenType = typeof tokenJson?.token_type === "string" ? tokenJson.token_type : "Bearer";
    const expiresIn = typeof tokenJson?.expires_in === "number" ? tokenJson.expires_in : null;
    const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
    const scopeStr = typeof tokenJson?.scope === "string" ? tokenJson.scope : null;
    const connectedScopes = scopeStr ? scopeStr.split(/\s+/).filter(Boolean) : null;

    // Encrypt access token before storing.
    const accessTokenEncrypted = encryptSecret(accessToken);

    // Verify via MCP get_store.
    const mcp = new ChariowMcpClient({ endpoint: CHARIOW_MCP_URL, accessToken });
    await mcp.initialize();
    const storeInfo = await mcp.callTool("get_store");

    const storeName =
      (storeInfo as any)?.name ??
      (storeInfo as any)?.store_name ??
      (storeInfo as any)?.title ??
      null;
    const chariowStoreId =
      (storeInfo as any)?.id ??
      (storeInfo as any)?.store_id ??
      (storeInfo as any)?.storeId ??
      null;

    const updated = {
      access_token_encrypted: accessTokenEncrypted,
      token_type: tokenType,
      token_expires_at: tokenExpiresAt,
      connected_scopes: connectedScopes,
      chariow_store_id: chariowStoreId ? String(chariowStoreId) : null,
      store_name: storeName ? String(storeName) : "Chariow boutique",
      mcp_url: CHARIOW_MCP_URL,
      connection_status: "connected",
      connection_error: null,
      connected_at: now.toISOString(),
      last_verified_at: now.toISOString(),
    };

    const { error: upErr } = await supabase.from("stores").update(updated).eq("id", attempt.store_id).eq("user_id", user.id);
    if (upErr) {
      console.error("Chariow connection persistence failed", upErr.message);
      await supabase
        .from("stores")
        .update({ connection_status: "failed", connection_error: "Impossible de sauvegarder la connexion", last_verified_at: now.toISOString() })
        .eq("id", storeId)
        .eq("user_id", user.id);
    }
    invalidateUserStoreList(user.id);

    if (!upErr) {
      const { data: connectedProfile } = await supabase.from("profiles").select("email").eq("id", user.id).maybeSingle();
      if (connectedProfile?.email) void updateBrevoContact(connectedProfile.email, { CHARIOW_CONNECTED: true });
      const { data: profile } = await supabase.from("profiles").select("experience_level").eq("id", user.id).maybeSingle();
      if (profile?.experience_level === "beginner" || profile?.experience_level === "some_experience") {
        const { count } = await supabase.from("user_notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id).eq("dedupe_key", "training_invitation");
        if (!count) {
          await supabase.from("user_notifications").insert({
            user_id: user.id,
            type: "admin",
            title: "Pack formation",
            body: "Apprends les bases du business des produits digitaux grâce à la formation incluse dans ton abonnement Vendeo. Consulte l’aperçu depuis Messages.",
            action_url: null,
            category: "training",
            dedupe_key: "training_invitation",
            metadata: { kind: "training_invitation", source: "first_chariow_connection" },
          });
        }
      }
    }

    await supabase.from("oauth_connection_attempts").delete().eq("state", state).eq("user_id", user.id);

    const dashboardResponse = redirectToDashboard(upErr ? "chariow=failed" : "chariow=connected");
    if (!upErr) dashboardResponse.cookies.set(STATUS_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax" });
    return dashboardResponse;
  } catch (e) {
    const message = e instanceof Error ? sanitizeErrorMessage(e.message) : "Connexion Chariow impossible";
    console.error("Chariow OAuth callback failed", message);
    if (storeId) {
      await supabase
        .from("stores")
        .update({ connection_status: "failed", connection_error: message, last_verified_at: now.toISOString() })
        .eq("id", storeId)
        .eq("user_id", user.id);
      invalidateUserStoreList(user.id);
    }
    await supabase.from("oauth_connection_attempts").delete().eq("state", state).eq("user_id", user.id);
    return redirectToDashboard("chariow=failed");
  }
}
