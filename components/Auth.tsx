"use client";

import { localizeSystemMessage } from "@/lib/i18n/system-messages";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useI18n } from "@/lib/i18n/i18n";
import { trackSuccessfulRegistration } from "@/lib/meta-pixel";
import { normalizeReferralCode } from "@/lib/referrals/rules";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal/versions";

export function Auth({ mode, configurationError = false, successRedirect = "/dashboard" }: { mode: "login" | "register" | "forgot"; configurationError?: boolean; successRedirect?: string }) {
  const { t , locale } = useI18n();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<"sent" | "cooldown" | null>(null);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [referralCode, setReferralCode] = useState("");
  const register = mode === "register";
  const forgot = mode === "forgot";

  useEffect(() => {
    if (!register || typeof window === "undefined") return;
    let code: string | null = null;
    try {
      const query = new URLSearchParams(window.location.search);
      if (query.has("ref")) {
        code = normalizeReferralCode(query.get("ref"));
        if (code) window.localStorage.setItem("vendeo_referral_code", code);
        else window.localStorage.removeItem("vendeo_referral_code");
      } else {
        code = normalizeReferralCode(window.localStorage.getItem("vendeo_referral_code"));
      }
    } catch {
      // A referral can still be used for this page view when browser storage is unavailable.
      code = normalizeReferralCode(new URLSearchParams(window.location.search).get("ref"));
    }
    setReferralCode(code ?? "");
  }, [register]);

  function cooldownKey(email: string, scope: "login" | "register" | "forgot" = mode) {
    return `vendeo_auth_cooldown:${scope}:${email.trim().toLowerCase()}`;
  }

  function getCooldownUntil(email: string, scope: "login" | "register" | "forgot" = mode) {
    try {
      const raw = sessionStorage.getItem(cooldownKey(email, scope));
      const value = raw ? Number(raw) : 0;
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }

  function setCooldown(email: string, milliseconds: number, scope: "login" | "register" | "forgot" = mode) {
    try { sessionStorage.setItem(cooldownKey(email, scope), String(Date.now() + milliseconds)); } catch { /* Storage may be unavailable. */ }
  }

  function getVerificationCooldownUntil(email: string) {
    return Math.max(getCooldownUntil(email, "login"), getCooldownUntil(email, "register"));
  }

  function setVerificationCooldown(email: string, milliseconds: number) {
    const until = Date.now() + milliseconds;
    setCooldown(email, milliseconds, "login");
    setCooldown(email, milliseconds, "register");
    return until;
  }

  function isRateLimitError(authError: { code?: string | null; message?: string | null }) {
    return /rate.?limit|exceed|too many|429/i.test(`${authError.code ?? ""} ${authError.message ?? ""}`);
  }

  async function resendVerificationLink(email: string) {
    const existingUntil = getVerificationCooldownUntil(email);
    if (Date.now() < existingUntil) {
      setVerificationNotice("cooldown");
      setCooldownUntil(existingUntil);
      setCooldownRemaining(Math.ceil((existingUntil - Date.now()) / 1000));
      return;
    }

    setError("");
    setSendingEmail(true);
    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard` },
      });
      if (resendError) {
        if (isRateLimitError(resendError)) {
          setVerificationNotice("cooldown");
          setCooldownUntil(setVerificationCooldown(email, 60_000));
          setError(t("auth.tooManyRequests"));
        } else {
          setVerificationNotice(null);
          setError(t("auth.verificationResendFailed"));
        }
        return;
      }
      setVerificationNotice("sent");
      setCooldownUntil(setVerificationCooldown(email, 60_000));
    } catch {
      setVerificationNotice(null);
      setError(t("auth.verificationResendFailed"));
    } finally {
      setSendingEmail(false);
    }
  }

  useEffect(() => {
    if (!cooldownUntil) {
      setCooldownRemaining(0);
      return;
    }
    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldownRemaining(remaining);
      if (remaining === 0) setVerificationNotice((notice) => notice === "cooldown" ? "sent" : notice);
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  function showUnconfirmedEmail(email: string) {
    setVerificationEmail(email);
    const until = getVerificationCooldownUntil(email);
    if (Date.now() < until) {
      setVerificationNotice("cooldown");
      setCooldownUntil(until);
      setCooldownRemaining(Math.ceil((until - Date.now()) / 1000));
      return Promise.resolve();
    }
    return resendVerificationLink(email);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitted(false);
    setVerificationNotice(null);
    setVerificationEmail("");
    setCooldownUntil(0);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const fullName = String(form.get("fullName") ?? "");
    const experienceLevel = String(form.get("experienceLevel") ?? "");
    if (register && !["beginner", "some_experience", "experienced", "expert"].includes(experienceLevel)) {
      setError(locale === "en" ? "Choose your experience level to continue." : "Choisissez votre niveau d’expérience pour continuer.");
      return;
    }
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
    } else {
      setSendingEmail(true);
    }

    try {
      const supabase = createClient();
      // Marqueur lu par le middleware : si Supabase renvoie le lien sur la landing,
      // on sait qu'il s'agit d'un reset de mot de passe et on redirige vers /reset-password.
      if (forgot) document.cookie = "vendeo_pw_reset=1; path=/; max-age=3600; samesite=lax";
      const result = forgot
        ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password` })
        : register
          ? await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, experience_level: experienceLevel, legal_acceptance: { terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION, accepted_at: new Date().toISOString() }, ...(referralCode ? { referral_code: referralCode } : {}) } } })
          : await supabase.auth.signInWithPassword({ email, password });

      if (result.error) {
        if (!register && !forgot && (result.error.code === "email_not_confirmed" || /email not confirmed/i.test(result.error.message ?? ""))) {
          await showUnconfirmedEmail(email);
          return;
        }
        if (isRateLimitError(result.error)) {
          setCooldown(email, 120_000);
          setError(t("auth.tooManyRequests"));
          return;
        }
        setError(result.error.message);
        return;
      }
      if (register) {
        try { window.localStorage.removeItem("vendeo_referral_code"); } catch { /* Storage may be unavailable. */ }
        trackSuccessfulRegistration();
        // Attendre la synchronisation Brevo avant la redirection après inscription.
        try {
          const response = await fetch("/api/emails/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, fullName }),
          });
          if (!response.ok) console.error("Brevo signup sync failed with status", response.status);
        } catch (error) {
          console.error("Brevo signup sync request failed", error instanceof Error ? error.message : "unknown");
        }
      }
      if (forgot || (register && "session" in result.data && !result.data.session)) {
        setSubmitted(true);
        return;
      }
      const localRedirect = successRedirect.startsWith("/") && !successRedirect.startsWith("//") ? successRedirect : "/dashboard";
      window.location.href = localRedirect;
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
        {verificationNotice && <div className="auth-success" role="status">
          <p>{verificationNotice === "cooldown" && cooldownRemaining > 0
            ? t("auth.emailNotConfirmedCooldown", { seconds: cooldownRemaining })
            : t("auth.emailNotConfirmed")}</p>
          <button className="btn btn-dark" type="button" onClick={() => void resendVerificationLink(verificationEmail)} disabled={sendingEmail || cooldownRemaining > 0}>
            {t("auth.resendVerificationLink")}
          </button>
        </div>}
        {submitted ? <div className="auth-success">{successMessage}</div> : (
          <form onSubmit={submit}>
            {register && <input type="hidden" name="referralCode" value={referralCode} />}
            {register && <div className="form-group"><label htmlFor="fullName">{t("auth.fullName")}</label><input id="fullName" name="fullName" required placeholder="Aïcha" /></div>}
            {register && <div className="form-group"><label htmlFor="experienceLevel">{locale === "en" ? "Your experience with digital products" : "Ton expérience avec les produits digitaux"}</label><select id="experienceLevel" name="experienceLevel" defaultValue="" required><option value="" disabled>{locale === "en" ? "Choose your experience level" : "Choisis ton niveau d’expérience"}</option><option value="beginner">{locale === "en" ? "I am just starting" : "Je débute complètement"}</option><option value="some_experience">{locale === "en" ? "I have some experience" : "J’ai quelques notions"}</option><option value="experienced">{locale === "en" ? "I already have experience" : "J’ai déjà de l’expérience"}</option><option value="expert">{locale === "en" ? "I am experienced and want to manage my business" : "Je suis expérimenté et je veux mieux gérer mon business"}</option></select></div>}
            <div className="form-group"><label htmlFor="email">{t("auth.email")}</label><input id="email" name="email" required type="email" placeholder={t("optionsExtra.text5")} /></div>
            {!forgot && <div className="form-group"><label htmlFor="password">{t("auth.password")}</label><input id="password" name="password" required type="password" placeholder={t("auth.passwordPlaceholder")} minLength={8} /></div>}
            {register && <label className="legal-consent"><input type="checkbox" name="acceptedLegal" required /><span><ShieldCheck size={14} aria-hidden="true" /> {t("auth.consent")} <Link href="/terms" target="_blank">{t("auth.terms")}</Link> {t("auth.and")} <Link href="/privacy" target="_blank">{t("auth.privacy")}</Link>. <small>{locale === "en" ? `Draft versions ${TERMS_VERSION} / ${PRIVACY_VERSION}` : `Versions de travail ${TERMS_VERSION} / ${PRIVACY_VERSION}`}</small></span></label>}
            {error && <p className="form-error">{localizeSystemMessage(error, locale)}</p>}
            <button className="btn btn-dark" type="submit" disabled={sendingEmail}>{forgot ? t("auth.sendLink") : register ? t("auth.createSpace") : t("auth.login")} <ArrowRight size={15} /></button>
          </form>
        )}
        {forgot ? <div className="auth-foot"><Link href="/login">{t("auth.backToLogin")}</Link></div> : register ? <div className="auth-foot">{t("auth.alreadyAccount")} <Link href="/login">{t("auth.login")}</Link></div> : <div className="auth-foot"><Link href="/forgot-password">{t("auth.forgotPassword")}</Link><span> · </span>{t("auth.noAccount")} <Link href="/register">{t("auth.createSpace")}</Link></div>}
      </div>
    </main>
  );
}
