"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, ShieldCheck, Store } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import type { StoreData } from "./shared";
import "@/app/store-connection-gate.css";

export const STORE_ONBOARDING_STORAGE_KEY = "vendeo_store_onboarding_v1";
type StoreOnboardingStep = "choice" | "welcome" | "instructions" | "connect";

function readSavedStep(): StoreOnboardingStep {
  try {
    const saved = window.localStorage.getItem(STORE_ONBOARDING_STORAGE_KEY);
    return saved === "welcome" || saved === "instructions" || saved === "connect" ? saved : "choice";
  } catch {
    return "choice";
  }
}

export function hasConnectedChariowStore(stores: StoreData[]) {
  return stores.some(store => store.platform === "chariow" && store.connection_status === "connected");
}

export function hasConnectedCommerceStore(stores: StoreData[]) {
  return hasConnectedChariowStore(stores) || stores.some(store => store.platform === "shopify" && store.connection_status === "connected" && store.is_active);
}

export function getChariowConnectTarget(stores: StoreData[]) {
  const existing = stores.find(store => store.platform === "chariow" && store.connection_status !== "connected");
  return existing ? `/api/integrations/chariow/connect?store_id=${encodeURIComponent(existing.id)}` : "/api/integrations/chariow/connect";
}

export function shouldShowStoreConnectionGate({
  stores,
  loading,
  loadFailed,
  offline,
  subscriptionExpired,
}: {
  stores: StoreData[];
  loading: boolean;
  loadFailed: boolean;
  offline: boolean;
  subscriptionExpired: boolean;
}) {
  return !loading && !loadFailed && !offline && !subscriptionExpired && !hasConnectedCommerceStore(stores);
}

export function StoreConnectionGate({ stores, failed, onSignOut, onConnectStart }: { stores: StoreData[]; failed: boolean; onSignOut: () => void; onConnectStart?: () => void | Promise<void> }) {
  const { locale } = useI18n();
  const en = locale === "en";
  const dialog = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<StoreOnboardingStep>("choice");
  const [stepRestored, setStepRestored] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setStep(readSavedStep());
    setStepRestored(true);
  }, []);

  useEffect(() => {
    if (!stepRestored) return;
    try {
      if (step === "choice") window.localStorage.removeItem(STORE_ONBOARDING_STORAGE_KEY);
      else window.localStorage.setItem(STORE_ONBOARDING_STORAGE_KEY, step);
    } catch {
      // The onboarding remains usable if local storage is unavailable.
    }
  }, [step, stepRestored]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  async function connect() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const target = getChariowConnectTarget(stores);
      if (!target.includes("store_id=")) {
        const response = await fetch("/api/integrations/chariow/connect/check");
        if (!response.ok) throw new Error("connection-check");
      }
      try { await onConnectStart?.(); } catch { /* OAuth should still proceed if onboarding persistence fails. */ }
      window.location.assign(target);
    } catch {
      setError(en ? "Unable to start the connection. Check your connection and try again." : "Impossible de démarrer la connexion. Vérifie ta connexion et réessaie.");
      setBusy(false);
    }
  }

  const title = step === "choice"
    ? (en ? "Do you already have a Chariow store?" : "As-tu déjà une boutique Chariow ?")
    : step === "welcome"
      ? (en ? "No problem — let’s get you started" : "Pas de panique, on t’accompagne")
      : step === "instructions"
        ? (en ? "Create your Chariow store" : "Créer ta boutique Chariow")
        : (en ? "Connect your Chariow store" : "Connecte ta boutique Chariow");

  return <div className="store-connection-backdrop">
    <div className="store-connection-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="store-connect-title" tabIndex={-1} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); return; }
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
        .filter(control => !control.matches('input[type="radio"]:not(:checked)'));
      const first = controls[0], last = controls[controls.length - 1];
      const fromHeadingOrDialog = !controls.includes(document.activeElement as HTMLElement);
      if (event.shiftKey && (document.activeElement === first || fromHeadingOrDialog)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || fromHeadingOrDialog)) { event.preventDefault(); first?.focus(); }
    }}>
      <span className="store-connection-icon"><Store size={28} aria-hidden="true" /></span>
      <span className="store-connection-kicker">{step === "choice" ? (en ? "FIRST STEPS" : "PREMIERS PAS") : (en ? "YOUR VENDEO WORKSPACE" : "TON ESPACE VENDEO")}</span>
      <h2 id="store-connect-title">{title}</h2>

      {step === "choice" ? <>
        <p id="store-connect-description">{en ? "Tell us where you are with your store. If you have not created one yet, we will guide you before you connect it." : "Dis-nous où tu en es. Si tu n’as pas encore créé ta boutique, nous te guiderons avant de la connecter."}</p>
        <div className="store-platform-options">
          <button className="store-platform-option" type="button" onClick={() => setStep("connect")}>
            <span className="store-platform-logo"><img src="/logos/chariow-mark.svg" alt="" width={36} height={36} /></span>
            <span><strong>{en ? "I already have a store" : "J’ai déjà une boutique"}</strong><small>{en ? "Connect my Chariow store to Vendeo" : "Connecter ma boutique Chariow à Vendeo"}</small></span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
          <button className="store-platform-option" type="button" onClick={() => setStep("welcome")}>
            <span className="store-platform-logo"><Store size={27} aria-hidden="true" /></span>
            <span><strong>{en ? "I don’t have a store yet" : "Je n’ai pas encore de boutique"}</strong><small>{en ? "Show me how to get started" : "Découvrir les étapes pour démarrer"}</small></span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
      </> : null}

      {step === "welcome" ? <>
        <p id="store-connect-description">{en ? "You may have just discovered a great opportunity. You can learn at your own pace — from creating your store to understanding your market and how your business works." : "Tu viens peut-être de découvrir une belle opportunité. Tu vas pouvoir apprendre progressivement, de la création de ta boutique à la compréhension du marché et du fonctionnement de ton activité."}</p>
        <button className="btn store-connection-cta" type="button" onClick={() => setStep("instructions")}>{en ? "Continue" : "Continuer"}<ArrowRight size={17} aria-hidden="true" /></button>
        <button className="store-connection-back" type="button" onClick={() => setStep("choice")}><ArrowLeft size={15} />{en ? "Back" : "Retour"}</button>
      </> : null}

      {step === "instructions" ? <>
        <p id="store-connect-description">{en ? "Follow these steps, then come back to Vendeo to connect your store." : "Suis ces étapes, puis reviens sur Vendeo pour connecter ta boutique."}</p>
        <ol className="store-onboarding-steps">
          <li>{en ? "Create or sign in to your Chariow account." : "Crée ton compte Chariow ou connecte-toi si tu en as déjà un."}</li>
          <li>{en ? "Create and set up your digital store on Chariow." : "Crée et configure ta boutique de produits digitaux sur Chariow."}</li>
          <li>{en ? "Return here and choose ‘I’ve created my store’ to connect it securely." : "Reviens ici et choisis « J’ai déjà créé ma boutique » pour la connecter en toute sécurité."}</li>
        </ol>
        <a className="btn store-connection-cta" href="https://chariow.com" target="_blank" rel="noopener noreferrer">{en ? "Create a Chariow account" : "Créer un compte Chariow"}<ExternalLink size={16} aria-hidden="true" /></a>
        <button className="btn store-connection-cta store-connection-cta-secondary" type="button" onClick={() => setStep("connect")}>{en ? "I’ve already created my store" : "J’ai déjà créé ma boutique"}<ArrowRight size={16} aria-hidden="true" /></button>
        <button className="store-connection-back" type="button" onClick={() => setStep("welcome")}><ArrowLeft size={15} />{en ? "Back" : "Retour"}</button>
      </> : null}

      {step === "connect" ? <>
        <p id="store-connect-description">{en ? "Authorize Vendeo to access your store and products. You will be redirected to Chariow securely." : "Autorise Vendeo à accéder à ta boutique et à tes produits. Tu seras redirigé vers Chariow de façon sécurisée."}</p>
        {(error || failed) && <p className="store-connection-error" role="alert">{error || (en ? "The connection was not completed. You can safely try again." : "La connexion n’a pas abouti. Tu peux réessayer en toute sécurité.")}</p>}
        <div className="store-platform-options">
          <button className="store-platform-option" type="button" aria-label="Chariow" disabled={busy} onClick={() => void connect()}>
            <span className="store-platform-logo"><img src="/logos/chariow-mark.svg" alt="" width={36} height={36} /></span>
            <span><strong>Chariow</strong><small>{busy ? (en ? "Connecting…" : "Connexion…") : (en ? "Connect your Chariow store" : "Connecte ta boutique Chariow")}</small></span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </div>
        <span className="store-connection-reassurance"><ShieldCheck size={15} aria-hidden="true" />{en ? "Secure connection, with your permission" : "Connexion sécurisée, avec ton autorisation"}</span>
        <button className="store-connection-back" type="button" disabled={busy} onClick={() => setStep("choice")}><ArrowLeft size={15} />{en ? "Back" : "Retour"}</button>
      </> : null}

      <button className="store-connection-signout" type="button" onClick={onSignOut}>{en ? "Sign out" : "Se déconnecter"}</button>
    </div>
  </div>;
}
