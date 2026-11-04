"use client";

import { ArrowRight, BookOpen, Check, Lock, X } from "lucide-react";
import { OPEN_SUBSCRIPTION_SECTION_EVENT } from "@/lib/subscription/ui";
import { useI18n } from "@/lib/i18n/i18n";
import { trainingGuideTitles } from "@/lib/training-guides";
import "@/app/first-store-welcome.css";

type Props = {
  subscription: { status?: string; trial_active?: boolean } | null;
  onDismiss: () => void;
};

export function TrainingWelcome({ subscription, onDismiss }: Props) {
  const { locale } = useI18n();
  const en = locale === "en";
  const subscribed = subscription?.status === "active" && subscription?.trial_active === false;
  function openSubscription() {
    window.dispatchEvent(new Event(OPEN_SUBSCRIPTION_SECTION_EVENT));
    onDismiss();
  }
  return <div className="vendeo-welcome-layer">
    <div className="vendeo-welcome-shade" />
    <section className="vendeo-welcome-card vendeo-training-welcome-card" role="dialog" aria-modal="true" aria-labelledby="vendeo-training-welcome-title" tabIndex={-1}>
      <button className="vendeo-welcome-close" type="button" onClick={onDismiss} aria-label={en ? "Skip training message" : "Passer le message formation"}><X size={20} /></button>
      <span className="vendeo-welcome-brand"><img src="/vendeo-logo.webp" alt="Vendeo" width={112} height={30} /> <span>{en ? "YOUR LEARNING PATH" : "TON PARCOURS D’APPRENTISSAGE"}</span></span>
      <span className="vendeo-welcome-symbol"><BookOpen size={32} aria-hidden="true" /></span>
      <span className="vendeo-welcome-connected"><Check size={14} aria-hidden="true" />{en ? "Training included" : "Formation incluse"}</span>
      <h2 id="vendeo-training-welcome-title">{en ? "Learn everything about digital products" : "Apprends tout sur le business des produits digitaux"}</h2>
      <p>{en ? "A practical training pack is included with your Vendeo subscription: market research, product creation, advertising and performance." : "Une formation pratique est incluse dans ton abonnement Vendeo : marché, création de produits, publicité et analyse des performances."}</p>
      <p className="training-poster-accessible">{en ? `The seven ebooks in the pack are: ${trainingGuideTitles("en")}.` : `Les sept ebooks du pack sont : ${trainingGuideTitles("fr")}.`}</p>
      <div className="vendeo-welcome-trial vendeo-training-welcome-note">
        <strong>{en ? "Activate your subscription to access it" : "Active ton abonnement pour y accéder"}</strong>
        <p>{en ? "You can skip this message. If you activate your subscription after the free trial, the training will still be waiting for you automatically." : "Tu peux passer ce message. Si tu actives ton abonnement après ta période d’essai, la formation restera automatiquement accessible."}</p>
        {!subscribed ? <small><Lock size={12} aria-hidden="true" /> {en ? "The complete pack is available with an active paid subscription." : "Le pack complet est disponible avec un abonnement payant actif."}</small> : <small><Check size={12} aria-hidden="true" /> {en ? "Your active subscription already includes the complete pack." : "Ton abonnement actif inclut déjà le pack complet."}</small>}
      </div>
      {!subscribed ? <button className="btn btn-dark vendeo-welcome-primary" type="button" onClick={openSubscription}>{en ? "Activate my subscription" : "Activer mon abonnement"}<ArrowRight size={17} aria-hidden="true" /></button> : null}
      <button className="vendeo-welcome-skip" type="button" onClick={onDismiss}>{en ? "Skip for now" : "Passer pour l’instant"}</button>
    </section>
  </div>;
}
