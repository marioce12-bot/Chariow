"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export function Auth({ mode, configurationError = false }: { mode: "login" | "register" | "forgot"; configurationError?: boolean }) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const register = mode === "register";
  const forgot = mode === "forgot";

  function cooldownKey(email: string) {
    const normalized = email.trim().toLowerCase();
    return `vendeo_auth_cooldown:${mode}:${normalized}`;
  }

  function getCooldownUntil(email: string): number {
    const raw = sessionStorage.getItem(cooldownKey(email));
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  }

  function setCooldown(email: string, ms: number) {
    sessionStorage.setItem(cooldownKey(email), String(Date.now() + ms));
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitted(false);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("fullName") ?? "");

    // Supabase Auth rate limits les emails : on évite les soumissions en boucle.
    if (register || forgot) {
      const until = getCooldownUntil(email);
      if (Date.now() < until) {
        const seconds = Math.ceil((until - Date.now()) / 1000);
        setError(`Trop de demandes pour cet email. Réessaie dans ${seconds}s.`);
        return;
      }
      setSendingEmail(true);
      // Cooldown conservateur dès la tentative pour éviter les clics multiples.
      setCooldown(email, 60_000);
    }

    const supabase = createClient();
    try {
      const result = forgot
        ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password` })
        : register
          ? await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
          : await supabase.auth.signInWithPassword({ email, password });

      if (result.error) {
        // Si Supabase retourne un rate limit, on prolonge légèrement le cooldown.
        const msg = result.error.message || "";
        if (/rate limit|exceed|too many|429/i.test(msg)) {
          setCooldown(email, 120_000);
          setError("Trop de tentatives récentes. Attends un peu avant de renvoyer l’email.");
          return;
        }
        setError(result.error.message);
        return;
      }

    if (forgot) {
      setSubmitted(true);
      return;
    }
    if (register && "session" in result.data && !result.data.session) {
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
    return <main className="auth-page"><div className="auth-card"><Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo-dark.svg" alt="Vendeo" width={150} height={40}/></Link><h1>{title}</h1><p>{description}</p>{configurationError&&<p style={{background:'#fff1f2',borderRadius:7,color:'#be123c',fontSize:12,lineHeight:1.5,padding:10}}>La connexion Supabase n’est pas configurée sur Vercel. Ajoute les variables d’environnement puis redéploie.</p>}{submitted ? <div style={{background:'#e9f5ff',borderRadius:8,color:'#123e75',fontSize:13,lineHeight:1.6,padding:16}}>{successMessage}</div> : <form onSubmit={submit}>{register&&<div className="form-group"><label>Ton prénom</label><input name="fullName" required placeholder="Aïcha"/></div>}<div className="form-group"><label>Email professionnel</label><input name="email" required type="email" placeholder="toi@exemple.com"/></div>{!forgot&&<div className="form-group"><label>Mot de passe</label><input name="password" required type="password" placeholder="8 caractères minimum" minLength={8}/></div>}{register&&<label style={{display:'flex',alignItems:'start',gap:8,color:'#64748b',fontSize:11,margin:'18px 0'}}><input type="checkbox" required style={{marginTop:2}}/> J'accepte les conditions d'utilisation et la politique de confidentialité.</label>}{error&&<p style={{background:'#fff1f2',borderRadius:7,color:'#be123c',fontSize:12,lineHeight:1.5,padding:10}}>{error}</p>}<button className="btn btn-dark" type="submit" disabled={(register || forgot) ? sendingEmail : false}>{forgot?'Envoyer le lien':register?'Créer mon espace':'Se connecter'} <ArrowRight size={15}/></button></form>}{forgot ? <div className="auth-foot"><Link href="/login">Retour à la connexion</Link></div> : register ? <div className="auth-foot">Déjà un compte ? <Link href="/login">Se connecter</Link></div> : <div className="auth-foot"><Link href="/forgot-password">Mot de passe oublié ?</Link><span> · </span>Pas encore de compte ? <Link href="/register">Créer ton espace</Link></div>}</div></main>;
}
