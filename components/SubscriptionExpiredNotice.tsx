"use client";

import { useEffect, useState } from "react";
import { OPEN_SUBSCRIPTION_SECTION_EVENT, SUBSCRIPTION_EXPIRED_MODAL_EVENT } from "@/lib/subscription/ui";
import { useI18n } from "@/lib/i18n/i18n";

type SubscriptionStatus = { status: string } | null;

const COPY = {
  fr: {
    bannerTitle: "Abonnement Vendeo expiré",
    bannerText: "Réactive ton abonnement pour continuer à utiliser l’Assistant, les publicités et Studio.",
    bannerAction: "Réactiver",
    dialogTitle: "Ton abonnement Vendeo a expiré",
    dialogText: "Réactive ton abonnement pour continuer à utiliser l’Assistant, les publicités et Studio. Tu peux le faire depuis la section Abonnement.",
    dialogAction: "Aller à Abonnement",
    close: "Fermer",
  },
  en: {
    bannerTitle: "Your Vendeo subscription has expired",
    bannerText: "Reactivate your subscription to keep using Assistant, Ads, and Studio.",
    bannerAction: "Reactivate",
    dialogTitle: "Your Vendeo subscription has expired",
    dialogText: "Reactivate your subscription to keep using Assistant, Ads, and Studio. You can do this in the Subscription section.",
    dialogAction: "Go to Subscription",
    close: "Close",
  },
} as const;

export function SubscriptionExpiredNotice({ subscription }: { subscription: SubscriptionStatus }) {
  const { locale } = useI18n();
  const copy = locale === "en" ? COPY.en : COPY.fr;
  const [expiredFromAction, setExpiredFromAction] = useState(false);
  const expired = subscription?.status === "past_due" || expiredFromAction;
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (subscription?.status === "active") setExpiredFromAction(false);
  }, [subscription?.status]);

  useEffect(() => {
    const showModal = () => {
      setExpiredFromAction(true);
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

  function openSubscriptionSection() {
    setModalOpen(false);
    window.dispatchEvent(new Event(OPEN_SUBSCRIPTION_SECTION_EVENT));
  }

  if (!expired) return null;

  return (
    <>
      <div className="vendeo-expired-banner" role="alert" aria-live="polite">
        <div className="vendeo-expired-banner-copy">
          <strong>{copy.bannerTitle}</strong>
          <span>{copy.bannerText}</span>
        </div>
        <button type="button" className="vendeo-expired-banner-action" onClick={openSubscriptionSection}>
          {copy.bannerAction}
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
            <span className="vendeo-expired-eyebrow">Vendeo</span>
            <h2 id="vendeo-expired-title">{copy.dialogTitle}</h2>
            <p id="vendeo-expired-description">{copy.dialogText}</p>
            <button type="button" className="vendeo-expired-dialog-action" onClick={openSubscriptionSection}>
              {copy.dialogAction}
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}
