"use client";

import { localizeSystemMessage } from "@/lib/i18n/system-messages";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useI18n } from "@/lib/i18n/i18n";

export function Auth({ mode, configurationError = false }: { mode: "login" | "register" | "forgot"; configurationError?: boolean }) {
  const { t , locale } = useI18n();
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

  async function requestExistingAccountLink(email: string) {
    setError("");
    setSubmitted(false);
    const until = getCooldownUntil(email);
    if (Date.now() < until) {
      setError(t("auth.tooManyForEmail", { seconds: Math.ceil((until - Date.now()) / 1000) }));
      return;
    }
    setSendingEmail(true);
    setCooldown(email, 60_000);
    try {
      const { error: otpError } = await createClient().auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/confirm` },
      });
      if (otpError && /rate limit|exceed|too many|429/i.test(otpError.message ?? "")) {
        setCooldown(email, 120_000);
        setError(t("auth.tooManyRequests"));
        return;
      }
      // Same neutral response whether the address has an existing account or not.
      setSubmitted(true);
    } catch {
      setError(locale === "en" ? "Sign-in is unavailable until the isolated Preview is configured." : "La connexion est indisponible tant que la Preview isolée n’est pas configurée.");
    } finally {
      setSendingEmail(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitted(false);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("fullName") ?? "");
    if (register && form.get("acceptedLegal") !== "on") {
      setError(locale === "en" ? "Please accept the Terms and Privacy Policy to create an account." : "Veuillez accepter les Conditions et la Politique de confidentialité pour créer un compte.");
      return;
    }

    if (register || forgot) {
      const until = getCooldownUntil(email);
      if (Date.now() < until) {
        setError(t("auth.tooManyForEmail", { seconds: Math.ceil((until - Date.now()) / 1000) }));
        return;
      }
      setSendingEmail(true);
      setCooldown(email, 60_000);
    }

    try {
      const supabase = createClient();
      // Marqueur lu par le middleware : si Supabase renvoie le lien sur la landing,
      // on sait qu'il s'agit d'un reset de mot de passe et on redirige vers /reset-password.
      if (forgot) document.cookie = "vendeo_pw_reset=1; path=/; max-age=3600; samesite=lax";
      const result = forgot
        ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password` })
        : register
          ? await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
          : await supabase.auth.signInWithPassword({ email, password });

      if (result.error) {
        if (/rate limit|exceed|too many|429/i.test(result.error.message ?? "")) {
          setCooldown(email, 120_000);
          setError(t("auth.tooManyRequests"));
          return;
        }
        setError(result.error.message);
        return;
      }
      if (register) {
        // Notification administrateur, sans bloquer la suite (fire-and-forget).
        void fetch("/api/emails/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, fullName }),
        });
      }
      if (forgot || (register && "session" in result.data && !result.data.session)) {
        setSubmitted(true);
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      setError(locale === "en" ? "Sign-in is unavailable until the isolated Preview is configured." : "La connexion est indisponible tant que la Preview isolée n’est pas configurée.");
    } finally {
      setSendingEmail(false);
    }
  }

  const title = forgot ? t("auth.resetTitle") : register ? t("auth.registerTitle") : t("auth.loginTitle");
  const description = forgot ? t("auth.resetDesc") : register ? t("auth.registerDesc") : t("auth.loginDesc");
  const successMessage = forgot ? t("auth.resetSuccess") : t("auth.registerSuccess");

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo.webp" alt="Vendeo" width={150} height={40} /></Link>
        <h1>{title}</h1>
        <p>{description}</p>
        {configurationError && <p className="form-error">{t("auth.configError")}</p>}
        {submitted ? <div className="auth-success">{register ? (locale === "en" ? "If an account can use this address, we’ll send a sign-in link. Check your inbox and confirm the email to continue." : "Si un compte peut utiliser cette adresse, nous enverrons un lien de connexion. Consultez votre boîte mail et confirmez l’adresse pour continuer.") : successMessage}</div> : (
          <form onSubmit={submit}>
            {register && <p className="auth-foot">{locale === "en" ? "If you previously requested account deletion, use the sign-in link below to restore access before the 90-day deadline." : "Si vous avez déjà demandé la suppression, utilisez le lien de connexion ci-dessous pour restaurer l’accès avant le délai de 90 jours."}</p>}
            {register && <div className="form-group"><label htmlFor="fullName">{t("auth.fullName")}</label><input id="fullName" name="fullName" required placeholder="Aïcha" /></div>}
            <div className="form-group"><label htmlFor="email">{t("auth.email")}</label><input id="email" name="email" required type="email" placeholder={t("optionsExtra.text5")} /></div>
            {!forgot && <div className="form-group"><label htmlFor="password">{t("auth.password")}</label><input id="password" name="password" required type="password" placeholder={t("auth.passwordPlaceholder")} minLength={8} /></div>}
            {register && <label className="legal-consent"><input type="checkbox" name="acceptedLegal" required /><span><ShieldCheck size={14} aria-hidden="true" /> {t("auth.consent")} <Link href="/terms" target="_blank">{t("auth.terms")}</Link> {t("auth.and")} <Link href="/privacy" target="_blank">{t("auth.privacy")}</Link>.</span></label>}
            {error && <p className="form-error">{localizeSystemMessage(error, locale)}</p>}
            <button className="btn btn-dark" type="submit" disabled={(register || forgot) ? sendingEmail : false}>{forgot ? t("auth.sendLink") : register ? t("auth.createSpace") : t("auth.login")} <ArrowRight size={15} /></button>
            {!forgot && <button className="btn btn-ghost" type="button" disabled={sendingEmail} onClick={event => {
              const form = event.currentTarget.form;
              const email = form?.elements.namedItem("email") as HTMLInputElement | null;
              if (!email?.reportValidity()) return;
              void requestExistingAccountLink(email.value);
            }}>{locale === "en" ? "Send a link to recover my existing account" : "Recevoir un lien pour retrouver mon compte"}</button>}
          </form>
        )}
        {forgot ? <div className="auth-foot"><Link href="/login">{t("auth.backToLogin")}</Link></div> : register ? <div className="auth-foot">{t("auth.alreadyAccount")} <Link href="/login">{t("auth.login")}</Link></div> : <div className="auth-foot"><Link href="/forgot-password">{t("auth.forgotPassword")}</Link><span> · </span>{t("auth.noAccount")} <Link href="/register">{t("auth.createSpace")}</Link></div>}
      </div>
    </main>
  );
}
