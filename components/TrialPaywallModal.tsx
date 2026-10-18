"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useI18n } from "@/lib/i18n/i18n";

type PaywallSubscription = { status: string } | null;

// Pop-up bloquante affichée dès que l'essai gratuit de 15 jours (ou l'abonnement payant
// de 30 jours) est expiré côté base (subscriptions.status = 'past_due').
// Elle n'est PAS fermable : ni croix, ni "Plus tard", ni clic sur le fond, ni Échap.
// Seules issues : s'abonner (paiement) ou se déconnecter.
export function TrialPaywallModal({ subscription }: { subscription: PaywallSubscription }) {
  const { locale, t } = useI18n();
  const w = (key: string) => t(`workspaceExtra.${key}`);
  const en = locale === "en";
  const [subscribing, setSubscribing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const shouldShow = subscription?.status === "past_due";

  // Bloque le scroll de la page derrière la pop-up et neutralise la touche Échap.
  useEffect(() => {
    if (!shouldShow) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [shouldShow]);

  if (!shouldShow) return null;

  async function subscribe() {
    setSubscribing(true);
    try {
      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "starter" }),
      });
      const data = await response.json();
      if (response.ok && data.payment?.url) {
        window.location.href = data.payment.url;
      } else {
        window.alert(data.error ?? w("paymentError"));
        setSubscribing(false);
      }
    } catch {
      window.alert(w("paymentError"));
      setSubscribing(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await createClient().auth.signOut();
    } finally {
      window.location.href = "/";
    }
  }

  return (
    // z-index 4001 : le fond .account-delete-backdrop est à 4000 dans globals.css.
    <div className="account-delete-backdrop" role="presentation" style={{ zIndex: 4001 }}>
      <section
        className="account-delete-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="trial-paywall-title"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="eyebrow">{w("paywallEyebrow")}</span>
        <h2 id="trial-paywall-title">{w("paywallTitle")}</h2>
        <p>
          {w("paywallDescription")}
        </p>
        <div className="account-delete-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void signOut()} disabled={subscribing || signingOut}>
            {signingOut ? w("signingOut") : (en ? "Sign out" : "Se déconnecter")}
          </button>
          <button type="button" className="btn btn-dark" onClick={() => void subscribe()} disabled={subscribing || signingOut}>
            {subscribing ? w("redirecting") : w("subscribe")}
          </button>
        </div>
      </section>
    </div>
  );
}
