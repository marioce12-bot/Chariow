"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useI18n } from "@/lib/i18n/i18n";

export function Auth({ mode, configurationError = false }: { mode: "login" | "register" | "forgot"; configurationError?: boolean }) {
  const { t } = useI18n();
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
        setError(t("auth.tooManyForEmail", { seconds: Math.ceil((until - Date.now()) / 1000) }));
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
        <Link href="/" className="brand"><Image className="brand-logo" src="/vendeo-logo-dark.svg" alt="Vendeo" width={150} height={40} /></Link>
        <h1>{title}</h1>
        <p>{description}</p>
        {configurationError && <p className="form-error">{t("auth.configError")}</p>}
        {submitted ? <div className="auth-success">{successMessage}</div> : (
          <form onSubmit={submit}>
            {register && <div className="form-group"><label htmlFor="fullName">{t("auth.fullName")}</label><input id="fullName" name="fullName" required placeholder="Aïcha" /></div>}
            <div className="form-group"><label htmlFor="email">{t("auth.email")}</label><input id="email" name="email" required type="email" placeholder="toi@exemple.com" /></div>
            {!forgot && <div className="form-group"><label htmlFor="password">{t("auth.password")}</label><input id="password" name="password" required type="password" placeholder={t("auth.passwordPlaceholder")} minLength={8} /></div>}
            {register && <label className="legal-consent"><input type="checkbox" required /><span><ShieldCheck size={14} aria-hidden="true" /> {t("auth.consent")} <Link href="/terms" target="_blank">{t("auth.terms")}</Link> {t("auth.and")} <Link href="/privacy" target="_blank">{t("auth.privacy")}</Link>.</span></label>}
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn-dark" type="submit" disabled={(register || forgot) ? sendingEmail : false}>{forgot ? t("auth.sendLink") : register ? t("auth.createSpace") : t("auth.login")} <ArrowRight size={15} /></button>
          </form>
        )}
        {forgot ? <div className="auth-foot"><Link href="/login">{t("auth.backToLogin")}</Link></div> : register ? <div className="auth-foot">{t("auth.alreadyAccount")} <Link href="/login">{t("auth.login")}</Link></div> : <div className="auth-foot"><Link href="/forgot-password">{t("auth.forgotPassword")}</Link><span> · </span>{t("auth.noAccount")} <Link href="/register">{t("auth.createSpace")}</Link></div>}
      </div>
    </main>
  );
}
