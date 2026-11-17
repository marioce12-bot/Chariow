"use client";

import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { OPEN_SUBSCRIPTION_SECTION_EVENT, SUBSCRIPTION_EXPIRED_MODAL_EVENT } from "@/lib/subscription/ui";
import { useI18n } from "@/lib/i18n/i18n";

type SubscriptionStatus = { status: string; trial_active?: boolean; trial_ends_at?: string | null } | null;

const COPY = {
  fr: {
    trial: {
      dialogTitle: "La période d’essai gratuite est terminée",
      dialogText: "Cette action nécessite un abonnement actif. Tu peux consulter tes sections, tes données et tes paramètres, puis choisir un abonnement si tu souhaites continuer.",
    },
    paid: {
      dialogTitle: "Ton abonnement Vendeo a expiré",
      dialogText: "Cette action nécessite un abonnement actif. Tes sections, données, paramètres et menus restent accessibles ; tu peux réactiver ton abonnement depuis sa page.",
    },
    required: {
      dialogTitle: "Cette action nécessite un abonnement actif",
      dialogText: "Tes sections, données et paramètres restent accessibles. Consulte la page Abonnement pour voir les options avant de continuer.",
    },
    dialogAction: "Voir les options d’abonnement",
    close: "Fermer",
  },
  en: {
    trial: {
      dialogTitle: "Your free trial has ended",
      dialogText: "This action requires an active subscription. You can still view your sections, data, and settings, then choose a subscription if you want to continue.",
    },
    paid: {
      dialogTitle: "Your Vendeo subscription has expired",
      dialogText: "This action requires an active subscription. Your sections, data, settings, and menus remain available; you can reactivate your subscription from its page.",
    },
    required: {
      dialogTitle: "An active subscription is required for this action",
      dialogText: "Your sections, data, and settings remain available. Visit the Subscription page to review your options before continuing.",
    },
    dialogAction: "View subscription options",
    close: "Close",
  },
} as const;

export function getSubscriptionExpiredCopy(locale: "fr" | "en", subscription: SubscriptionStatus) {
  const group = locale === "en" ? COPY.en : COPY.fr;
  const status = subscription?.trial_active === true ? "trial" : subscription?.status === "past_due" ? "paid" : "required";
  return { ...group[status], dialogAction: group.dialogAction, close: group.close };
}

export function SubscriptionExpiredNotice({ subscription }: { subscription: SubscriptionStatus }) {
  const { locale } = useI18n();
  const copy = getSubscriptionExpiredCopy(locale, subscription);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const showModal = () => setModalOpen(true);
    window.addEventListener(SUBSCRIPTION_EXPIRED_MODAL_EVENT, showModal);
    return () => window.removeEventListener(SUBSCRIPTION_EXPIRED_MODAL_EVENT, showModal);
  }, []);

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

  function openSubscriptionSection() {
    setModalOpen(false);
    window.dispatchEvent(new Event(OPEN_SUBSCRIPTION_SECTION_EVENT));
  }

  if (!modalOpen) return null;

  return (
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
        <button type="button" className="vendeo-expired-dialog-action" onClick={openSubscriptionSection}>
          {copy.dialogAction}
        </button>
      </section>
    </div>
  );
}
