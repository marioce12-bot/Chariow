"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/i18n";
import { createClient } from "@/lib/supabase/browser";

type AccountState = { state: "active" | "pending" | "expired"; purge_after?: string };
export default function AccountRestoration({ demo = false }: { demo?: boolean }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [account, setAccount] = useState<AccountState | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (demo) { setAccount({ state: "pending", purge_after: "2027-01-21T10:00:00Z" }); setLoading(false); return; }
    let mounted = true;
    fetch("/api/account").then(async response => {
      if (!response.ok) throw new Error("status");
      const data = await response.json();
      if (!(["active", "pending", "expired"].includes(data?.state))) throw new Error("invalid");
      if (mounted) setAccount(data as AccountState);
    }).catch(() => { if (mounted) setMessage(en ? "We couldn’t verify your account status. No restoration was attempted." : "Impossible de vérifier l’état du compte. Aucune restauration n’a été tentée."); }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [en, demo]);
  async function verifyEmail() {
    if (demo) { setMessage(en ? "Demo: email verification simulated. No email sent." : "Démonstration : vérification simulée. Aucun e-mail envoyé."); return; }
    try {
      const client = createClient();
      const { data: { user } } = await client.auth.getUser();
      if (!user?.email) throw new Error("auth");
      const { error } = await client.auth.signInWithOtp({ email: user.email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/confirm` } });
      if (error) throw error;
      setMessage(en ? "Open the verification link sent to your email, then confirm restoration here." : "Ouvrez le lien de vérification envoyé à votre adresse e-mail, puis confirmez ici la restauration.");
    } catch { setMessage(en ? "Unable to send the verification link. Please try again later." : "Impossible d’envoyer le lien de vérification. Réessayez plus tard."); }
  }
  async function signOut(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (demo) { window.location.href = "/login"; return; }
    await createClient().auth.signOut();
    window.location.href = "/login";
  }
  async function restore() {
    setRestoring(true); setMessage("");
    try {
      if (demo) { setAccount({ state: "active" }); setMessage("Démonstration uniquement : même compte fictif, échéance d’essai inchangée. Aucune donnée réelle modifiée."); return; }
      const response = await fetch("/api/account/restore", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.restored !== true) throw new Error("restore");
      setAccount({ state: "active" });
      setMessage(en ? "Your account has been restored. Your trial has not been reset or extended." : "Votre compte a été restauré. Votre essai n’a été ni réinitialisé ni prolongé.");
    } catch {
      setMessage(en ? "Restoration could not be confirmed. No automatic retry was made; please sign in again or contact support." : "La restauration n’a pas pu être confirmée. Aucune nouvelle tentative automatique n’a été faite ; reconnectez-vous ou contactez l’assistance.");
    } finally { setRestoring(false); }
  }
  return <main className="auth-page"><section className="auth-card">{demo && <p className="eyebrow">Preview · données fictives · sans connexion à une base réelle</p>}<h1>{en ? "Restore your account" : "Restaurer votre compte"}</h1>{loading ? <p>{en ? "Checking account status…" : "Vérification de l’état du compte…"}</p> : <>
    {account?.state === "pending" && <><p>{en ? "Your account is suspended and its data is retained for 90 days. Verify your email by signing in with the magic link before the deadline." : "Votre compte est suspendu et ses données sont conservées pendant 90 jours. Vérifiez votre adresse e-mail en vous connectant avec le lien magique avant l’échéance."}</p>{account.purge_after && <p>{en ? "Recovery deadline: " : "Échéance de restauration : "}{new Date(account.purge_after).toLocaleString(en ? "en" : "fr-FR")}</p>}<p>{en ? "The 15-day trial continues; restoration does not reset or extend it." : "L’essai de 15 jours continue ; la restauration ne le réinitialise ni ne le prolonge."}</p><button className="btn btn-dark" onClick={() => void restore()} disabled={restoring}>{restoring ? (en ? "Restoring…" : "Restauration…") : (en ? "Restore account" : "Restaurer le compte")}</button></>}
    {account?.state === "pending" && <p><button className="btn btn-ghost" onClick={() => void verifyEmail()}>{en ? "Verify my email with a link" : "Vérifier mon e-mail par un lien"}</button></p>}
    {account?.state === "active" && <><p>{en ? "Your account is active." : "Votre compte est actif."}</p>{!demo && <Link href="/dashboard">{en ? "Continue to dashboard" : "Accéder au tableau de bord"}</Link>}</>}{account?.state === "expired" && <p>{en ? "The recovery period has ended. The account can no longer be restored." : "Le délai de restauration est expiré. Le compte ne peut plus être restauré."}</p>}{message && <p role="status">{message}</p>}
  </>}<p><Link href="/login" onClick={signOut}>{en ? "Sign out" : "Se déconnecter"}</Link></p></section></main>;
}
