"use client";

import { useEffect, useState } from "react";
import { CreditCard, ShieldCheck } from "lucide-react";
import { SUBSCRIPTION_EXPIRED_MODAL_EVENT } from "@/lib/subscription/ui";
import { createSubscriptionCheckout } from "@/lib/subscription/checkout";
import { useI18n } from "@/lib/i18n/i18n";

type SubscriptionStatus = { status: string; trial_active?: boolean; trial_ends_at?: string | null } | null;

const COPY = {
  fr: {
    trial: {
      bannerTitle: "Ton essai gratuit est terminé",
      bannerText: "Active Vendeo pour retrouver l’accès à l’Assistant, aux publicités et au Studio.",
      dialogTitle: "La période d’essai gratuite est terminée",
      dialogText: "Active Vendeo pour continuer à utiliser les sections métier. Notifications, Paramètres et Abonnement restent accessibles.",
    },
    paid: {
      bannerTitle: "Ton abonnement Vendeo a expiré",
      bannerText: "Réactive Vendeo pour retrouver l’accès à l’Assistant, aux publicités et au Studio.",
      dialogTitle: "Ton abonnement Vendeo a expiré",
      dialogText: "Réactive ton abonnement pour retrouver l’accès aux sections métier. Notifications, Paramètres et Abonnement restent accessibles.",
    },
    bannerAction: "Activer l’abonnement",
    dialogAction: "Continuer vers le paiement",
    redirecting: "Ouverture du paiement…",
    securePayment: "Paiement sécurisé · Accès rétabli après confirmation",
    paymentError: "Le paiement n’a pas pu démarrer. Vérifie ta connexion puis réessaie.",
    close: "Fermer",
  },
  en: {
    trial: {
      bannerTitle: "Your free trial has ended",
      bannerText: "Activate the Vendeo subscription to regain access to Assistant, Ads, and Studio.",
      dialogTitle: "Your free trial has ended",
      dialogText: "Activate the Vendeo subscription to keep using business sections. Notifications, Settings, and Subscription remain available.",
    },
    paid: {
      bannerTitle: "Your Vendeo subscription has expired",
      bannerText: "Reactivate your subscription to keep using Assistant, Ads, and Studio.",
      dialogTitle: "Your Vendeo subscription has expired",
      dialogText: "Reactivate your subscription to regain access to business sections. Notifications, Settings, and Subscription remain available.",
    },
    bannerAction: "Activate subscription",
    dialogAction: "Continue to payment",
    redirecting: "Opening payment…",
    securePayment: "Secure payment · Access returns after payment is confirmed",
    paymentError: "Payment could not be started. Check your connection and try again.",
    close: "Close",
  },
} as const;

export function getSubscriptionExpiredCopy(locale: "fr" | "en", subscription: SubscriptionStatus) {
  const group = locale === "en" ? COPY.en : COPY.fr;
  return { ...group[subscription?.trial_active === true ? "trial" : "paid"], bannerAction: group.bannerAction, dialogAction: group.dialogAction, redirecting: group.redirecting, securePayment: group.securePayment, paymentError: group.paymentError, close: group.close };
}

export function SubscriptionExpiredNotice({ subscription }: { subscription: SubscriptionStatus }) {
  const { locale } = useI18n();
  const [expiredFromAction, setExpiredFromAction] = useState(false);
  const expired = subscription?.status === "past_due" || expiredFromAction;
  const copy = getSubscriptionExpiredCopy(locale, subscription);
  const [modalOpen, setModalOpen] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (subscription?.status === "active") setExpiredFromAction(false);
  }, [subscription?.status]);

  useEffect(() => {
    const showModal = () => {
      setExpiredFromAction(true);
      setCheckoutError(null);
      setModalOpen(true);
    };
    window.addEventListener(SUBSCRIPTION_EXPIRED_MODAL_EVENT, showModal);
    return () => window.removeEventListener(SUBSCRIPTION_EXPIRED_MODAL_EVENT, showModal);
  }, []);

  useEffect(() => {
    if (!expired) setModalOpen(false);
  }, [expired]);

  useEffect(() => {
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [modalOpen]);

  async function activateSubscription() {
    if (checkoutPending) return;
    setCheckoutPending(true);
    setCheckoutError(null);
    try {
      const checkoutUrl = await createSubscriptionCheckout();
      window.location.assign(checkoutUrl);
    } catch {
      setCheckoutError(copy.paymentError);
      setModalOpen(true);
      setCheckoutPending(false);
    }
  }

  if (!expired) return null;

  return (
    <>
      <div className="vendeo-expired-banner" role="alert" aria-live="polite">
        <span className="vendeo-expired-symbol" aria-hidden="true"><CreditCard size={18} /></span>
        <div className="vendeo-expired-banner-copy">
          <strong>{copy.bannerTitle}</strong>
          <span>{copy.bannerText}</span>
        </div>
        <button type="button" className="vendeo-expired-banner-action" onClick={() => void activateSubscription()} disabled={checkoutPending}>
          {checkoutPending ? copy.redirecting : copy.bannerAction}
        </button>
      </div>
      {modalOpen ? (
        <div className="vendeo-expired-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
          <section
            className="vendeo-expired-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="vendeo-expired-title"
            aria-describedby="vendeo-expired-description"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="vendeo-expired-close" aria-label={copy.close} onClick={() => setModalOpen(false)}>
              ×
            </button>
            <span className="vendeo-expired-dialog-symbol" aria-hidden="true"><CreditCard size={24} /></span>
            <span className="vendeo-expired-eyebrow">Vendeo · Abonnement</span>
            <h2 id="vendeo-expired-title">{copy.dialogTitle}</h2>
            <p id="vendeo-expired-description">{copy.dialogText}</p>
            {checkoutError ? <p className="vendeo-expired-error" role="alert">{checkoutError}</p> : null}
            <button type="button" className="vendeo-expired-dialog-action" onClick={() => void activateSubscription()} disabled={checkoutPending}>
              {checkoutPending ? copy.redirecting : copy.dialogAction}
            </button>
            <span className="vendeo-expired-reassurance"><ShieldCheck size={15} aria-hidden="true" />{copy.securePayment}</span>
          </section>
        </div>
      ) : null}
    </>
  );
}
