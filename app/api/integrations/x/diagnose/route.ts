import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { fetchXAdsAccounts, XAdsApiError, X_ADS_API_BASE_URL } from "@/lib/x/api";

export const dynamic = "force-dynamic";

// Diagnostic X Ads pour l'utilisateur connecté. Ne renvoie jamais de secret : uniquement
// des booléens de configuration, l'état stocké et le résultat d'un nouvel appel /accounts.
export async function GET() {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;

  const env = {
    X_API_KEY: Boolean(process.env.X_API_KEY),
    X_API_SECRET: Boolean(process.env.X_API_SECRET),
    TOKEN_ENCRYPTION_KEY: Boolean(process.env.TOKEN_ENCRYPTION_KEY),
    X_ADS_OAUTH_REDIRECT_URI: process.env.X_ADS_OAUTH_REDIRECT_URI ?? null,
    X_ADS_API_BASE_URL,
  };

  const { data: rows, error: integrationsError } = await supabase
    .from("x_ads_integrations")
    .select("id,x_screen_name,is_active,last_error,access_token_encrypted,access_token_secret_encrypted")
    .eq("user_id", user.id);
  const { count: accountsCount, error: accountsError } = await supabase
    .from("x_ads_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_active", true);

  const dbError = integrationsError?.message ?? accountsError?.message ?? null;
  const integrations = (rows ?? []).map((row) => ({ x_screen_name: row.x_screen_name, is_active: row.is_active, last_error: row.last_error }));

  let retest: { ok: boolean; status?: number; accounts?: number; detail?: string } | null = null;
  const latest = (rows ?? [])[0];
  if (latest && env.X_API_KEY && env.X_API_SECRET) {
    try {
      const accounts = await fetchXAdsAccounts(decryptSecret(latest.access_token_encrypted), decryptSecret(latest.access_token_secret_encrypted));
      retest = { ok: true, accounts: accounts.length };
    } catch (error) {
      retest = error instanceof XAdsApiError
        ? { ok: false, status: error.status, detail: error.detail }
        : { ok: false, detail: error instanceof Error ? error.message : "Erreur inconnue" };
    }
  }

  const verdict: string[] = [];
  if (!env.X_API_KEY || !env.X_API_SECRET) verdict.push("X_API_KEY / X_API_SECRET absents sur Vercel.");
  if (!env.X_ADS_OAUTH_REDIRECT_URI) verdict.push("X_ADS_OAUTH_REDIRECT_URI absent sur Vercel.");
  if (!env.TOKEN_ENCRYPTION_KEY) verdict.push("TOKEN_ENCRYPTION_KEY absent sur Vercel.");
  if (dbError) verdict.push(`Erreur Supabase (migration x_ads_integration appliquée ?) : ${dbError}`);
  if (!latest && !dbError) verdict.push("Aucune autorisation X enregistrée : relance « Connecter X Ads ».");
  if (retest && !retest.ok) {
    if (retest.status === 403) verdict.push("403 : l'app X n'a pas l'accès X Ads API (Standard Access non approuvé), ou le compte X autorisé n'a aucun rôle sur un compte publicitaire.");
    else if (retest.status === 401) verdict.push("401 : token invalide, ou X_API_KEY / X_API_SECRET ne correspondent pas à l'app qui a donné l'autorisation.");
    else verdict.push(`Appel X Ads en échec (${retest.status ?? "réseau"}).`);
  }
  if (retest?.ok && retest.accounts === 0) verdict.push("Autorisation OK mais aucun compte publicitaire accessible : crée-en un sur ads.x.com (rôle Ad manager ou Account administrator).");
  if (retest?.ok && retest.accounts && !accountsCount) verdict.push("X renvoie des comptes mais rien n'est enregistré : relance « Connecter X Ads ».");

  return NextResponse.json({ env, integrations, activeAccounts: accountsCount ?? 0, retest, verdict });
}
