"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function Auth({ mode, configurationError = false }: { mode: "login" | "register" | "forgot"; configurationError?: boolean }) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const register = mode === "register";
  const forgot = mode === "forgot";

  function cooldownKey(email: string) {
    return `vendeo_auth_cooldown:${mode}:${email.trim().toLowerCase()}`;
  }

  function getCooldownUntil(email: string) {
    const raw = sessionStorage.getItem(cooldownKey(email));
    const value = raw ? Number(raw) : 0;
    return Number.isFinite(value) ? value : 0;
  }

  function setCooldown(email: string, milliseconds: number) {
    sessionStorage.setItem(cooldownKey(email), String(Date.now() + milliseconds));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitted(false);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("fullName") ?? "");

    if (register || forgot) {
      const until = getCooldownUntil(email);
      if (Date.now() < until) {
        setError(`Trop de demandes pour cet email. Réessaie dans ${Math.ceil((until - Date.now()) / 1000)}s.`);
        return;
      }
      setSendingEmail(true);
      setCooldown(email, 60_000);
    }

    try {
      const supabase = createClient();
      const result = forgot
        ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password` })
        : register
          ? await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
          : await supabase.auth.signInWithPassword({ email, password });

      if (result.error) {
        if (/rate limit|exceed|too many|429/i.test(result.error.message ?? "")) {
          setCooldown(email, 120_000);
          setError("Trop de tentatives récentes. Attends un peu avant de renvoyer l’email.");
          return;
        }
        setError(result.error.message);
        return;
      }
      if (forgot || (register && "session" in result.data && !result.data.session)) {
        setSubmitted(true);
        return;
      }
      window.location.href = "/dashboard";
    } finally {
      setSendingEmail(false);
    }
  }

  const title = forgot ? "Réinitialise ton mot de passe." : register ? "Crée ton espace." : "Content de te revoir.";
  const description = forgot ? "Reçois un lien sécurisé pour choisir un nouveau mot de passe." : register ? "Ton business mérite mieux que des suppositions." : "Retrouve tes données et ton prochain bon move.";
  const successMessage = forgot ? "Si un compte existe avec cette adresse, un lien de réinitialisation vient d’être envoyé." : "Un email de confirmation vient de t’être envoyé. Confirme ton adresse pour accéder à ton espace.";

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo-dark.svg" alt="Vendeo" width={150} height={40} /></Link>
        <h1>{title}</h1>
        <p>{description}</p>
        {configurationError && <p className="form-error">La connexion Supabase n’est pas configurée sur Vercel. Ajoute les variables d’environnement puis redéploie.</p>}
        {submitted ? <div className="auth-success">{successMessage}</div> : (
          <form onSubmit={submit}>
            {register && <div className="form-group"><label htmlFor="fullName">Ton prénom</label><input id="fullName" name="fullName" required placeholder="Aïcha" /></div>}
            <div className="form-group"><label htmlFor="email">Email professionnel</label><input id="email" name="email" required type="email" placeholder="toi@exemple.com" /></div>
            {!forgot && <div className="form-group"><label htmlFor="password">Mot de passe</label><input id="password" name="password" required type="password" placeholder="8 caractères minimum" minLength={8} /></div>}
            {register && <label className="legal-consent"><input type="checkbox" required /><span><ShieldCheck size={14} aria-hidden="true" /> J’accepte les <Link href="/terms" target="_blank">conditions d’utilisation</Link> et la <Link href="/privacy" target="_blank">politique de confidentialité</Link>.</span></label>}
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn-dark" type="submit" disabled={(register || forgot) ? sendingEmail : false}>{forgot ? "Envoyer le lien" : register ? "Créer mon espace" : "Se connecter"} <ArrowRight size={15} /></button>
          </form>
        )}
        {forgot ? <div className="auth-foot"><Link href="/login">Retour à la connexion</Link></div> : register ? <div className="auth-foot">Déjà un compte ? <Link href="/login">Se connecter</Link></div> : <div className="auth-foot"><Link href="/forgot-password">Mot de passe oublié ?</Link><span> · </span>Pas encore de compte ? <Link href="/register">Créer un espace</Link></div>}
      </div>
    </main>
  );
}
