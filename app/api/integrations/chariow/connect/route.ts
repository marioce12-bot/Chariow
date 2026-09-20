import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { CHARIOW_MCP_URL } from "@/lib/chariow/types";
import { resolveUserMaxStores } from "@/lib/plans";
import crypto from "node:crypto";

// Cookie lu par ChariowStatusNotice pour afficher un message clair au retour sur le dashboard.
const STATUS_COOKIE = "vendeo_chariow_status";

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

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const redirectUri = process.env.CHARIOW_OAUTH_REDIRECT_URI;
  const requestedStoreId = new URL(request.url).searchParams.get("store_id");
  let existing: { id: string } | null = null;

  // Reuse the user's existing Chariow store for reconnection, especially on Starter.
  if (requestedStoreId) {
    const { data, error: findErr } = await supabase
      .from("stores")
      .select("id")
      .eq("id", requestedStoreId)
      .eq("user_id", user.id)
      .eq("platform", "chariow")
      .eq("is_active", true)
      .maybeSingle();
    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
    existing = data;
    if (!existing) return NextResponse.json({ error: "Boutique Chariow introuvable" }, { status: 404 });
  } else {
    // Sans store_id : on réutilise une boutique Chariow déjà présente mais pas connectée
    // (déconnectée, expirée, en échec) au lieu d'en créer une nouvelle à chaque tentative.
    // Avant, chaque essai raté (Chariow indisponible) laissait une boutique « Chariow boutique »
    // en plus, ce qui faussait la boutique affichée et pouvait bloquer sur la limite du plan.
    const { data: reusable } = await supabase
      .from("stores")
      .select("id")
      .eq("user_id", user.id)
      .eq("platform", "chariow")
      .eq("is_active", true)
      .neq("connection_status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    existing = reusable ?? null;
  }

  if (!existing) {
    const { count } = await supabase
      .from("stores")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_active", true);
    // Nombre de boutiques autorisées par le plan actif de l'utilisateur
    // (1 pour Vendeo, 3 pour Vendeo Premium — cf. lib/plans.ts).
    const maxStores = await resolveUserMaxStores(supabase, user.id);
    if ((count ?? 0) >= maxStores) {
      return NextResponse.json({ error: `Ton abonnement autorise ${maxStores} boutique(s). Passe au plan Vendeo Premium (3 000 XOF/mois) pour en connecter jusqu'à 3.` }, { status: 403 });
    }
  }

  if (!redirectUri) {
    return NextResponse.json({ error: "Chariow OAuth n'est pas configuré" }, { status: 500 });
  }

  // Si une boutique existante est réutilisable (store_id fourni, ou boutique non connectée), on la
  // réutilise. Sinon on crée une nouvelle boutique (tant que le plan le permet).
  let storeId: string;
  let createdNew = false;
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
    createdNew = true;
  }

  const state = base64UrlEncode(crypto.randomBytes(32));
  const { codeVerifier, codeChallenge } = generatePkce();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  let registerResponse: Response | null = null;
  let registration: Record<string, unknown> = {};
  try {
    registerResponse = await fetch("https://mcp.chariow.com/public/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_name: "Vendeo",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scopes: ["store:mcp"],
        token_endpoint_auth_method: "none",
      }),
      cache: "no-store",
      // Sans délai maximum, une panne de Chariow pouvait laisser la requête pendre.
      signal: AbortSignal.timeout(15_000),
    });
    registration = await registerResponse.json().catch(() => ({}));
  } catch (registerError) {
    console.error("Chariow OAuth dynamic registration unreachable", registerError instanceof Error ? registerError.message : String(registerError));
  }
  const oauthClientId = typeof registration.client_id === "string" ? registration.client_id : null;
  if (!registerResponse?.ok || !oauthClientId) {
    const failure = { connection_status: "failed", connection_error: "Chariow ne répond pas pour le moment. Réessaie dans quelques minutes." };
    // Une boutique créée uniquement pour cette tentative est désactivée pour ne pas laisser de doublon ;
    // une boutique déjà existante reste en place, simplement marquée en échec.
    await supabase.from("stores").update(createdNew ? { ...failure, is_active: false } : failure).eq("id", storeId).eq("user_id", user.id);
    console.error("Chariow OAuth dynamic registration failed", registerResponse?.status ?? "no response", registration.error ?? "missing client_id");
    // On renvoie l'utilisateur sur le dashboard (au lieu d'une page JSON brute) ; le bandeau explique la panne.
    const failed = NextResponse.redirect(new URL("/dashboard?chariow=failed", request.url));
    failed.cookies.set(STATUS_COOKIE, "unavailable", { path: "/", maxAge: 15 * 60, sameSite: "lax" });
    return failed;
  }

  const { error: attemptErr } = await supabase.from("oauth_connection_attempts").insert({
    user_id: user.id,
    platform: "chariow",
    store_id: storeId,
    state,
    code_verifier_encrypted: encryptSecret(codeVerifier),
    oauth_client_id: oauthClientId,
    expires_at: expiresAt.toISOString(),
  });
  if (attemptErr) {
    const failure = { connection_status: "failed", connection_error: "Impossible de préparer la connexion Chariow" };
    await supabase.from("stores").update(createdNew ? { ...failure, is_active: false } : failure).eq("id", storeId).eq("user_id", user.id);
    return NextResponse.json({ error: "Impossible de préparer la connexion Chariow" }, { status: 500 });
  }

  const url = new URL("https://mcp.chariow.com/public/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", oauthClientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "store:mcp");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return NextResponse.redirect(url);
}
