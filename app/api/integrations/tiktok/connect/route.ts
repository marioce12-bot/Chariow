import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

// Écran d'information affiché AVANT la redirection vers TikTok : sans compte
// TikTok Ads Manager (business), l'autorisation échoue et l'utilisateur reste
// bloqué. Le compte TikTok personnel ne suffit pas (comme Meta exige un compte
// publicitaire et pas seulement un profil Facebook). Ce point d'entrée unique
// couvre tous les boutons "Connecter TikTok Ads" (Pub, Paramètres, wizard).
function prerequisitesPage(continueHref: string) {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connecter TikTok Ads</title>
<style>body{margin:0;background:#050b1e;color:#e8ecf8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}main{max-width:460px;margin:0 auto}h1{font-size:22px;margin:8px 0 12px}p,li{color:#aab3d1;line-height:1.5;font-size:15px}ul{padding-left:20px}.card{background:#0e1a3a;border:1px solid #1d2c5a;border-radius:16px;padding:18px;margin:16px 0}a.btn{display:block;text-align:center;padding:14px;border-radius:999px;font-weight:600;text-decoration:none;margin:10px 0}a.primary{background:linear-gradient(90deg,#7c3aed,#0ea5e9);color:#fff}a.secondary{border:1px solid #2a3a6b;color:#e8ecf8}a.link{color:#8b93b8;text-align:center;display:block;margin-top:14px;font-size:14px}</style></head><body><main>
<h1>Avant de connecter TikTok Ads</h1>
<p>Pour lancer des pubs depuis Vendeo, il te faut un compte <strong>TikTok Ads Manager</strong> (compte publicitaire business). Ton compte TikTok personnel ne suffit pas : sans compte publicitaire, la connexion échoue.</p>
<div class="card"><p style="margin-top:0"><strong>Vérifie que tu as :</strong></p><ul><li>un compte TikTok Ads Manager (gratuit à créer)</li><li>un moyen de paiement configuré dans ce compte : TikTok te facture directement</li><li>une identité (profil) dans Actifs &gt; Identités</li><li>pour les objectifs ventes/leads : un Pixel dans Events</li></ul></div>
<a class="btn primary" href="${continueHref}">J'ai un compte publicitaire, continuer</a>
<a class="btn secondary" href="https://ads.tiktok.com/" target="_blank" rel="noopener">Créer mon compte TikTok Ads Manager</a>
<a class="link" href="/dashboard">Retour</a>
</main></body></html>`;
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const { supabase, user, response } = await requireUser();
  if (!user) return response;
  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.get("confirmed") !== "1") return prerequisitesPage(`${requestUrl.pathname}?confirmed=1`);
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
