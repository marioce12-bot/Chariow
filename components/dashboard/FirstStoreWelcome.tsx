"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, PartyPopper, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import type { SubscriptionData } from "./shared";
import "@/app/first-store-welcome.css";

export const VENDEO_TOUR_STEPS = [
  { target: "store", fr: "Ta boutique, toujours à portée de main", en: "Your store, always within reach", body: "Ce sélecteur permet de choisir la boutique dont tu consultes les données. Tu peux gérer tes connexions dans Boutiques.", english: "Use this selector to choose which store’s data you see. Manage your connections in Stores." },
  { target: "Vue d'ensemble", fr: "Ton activité en un coup d’œil", en: "Your business at a glance", body: "La Vue d’ensemble rassemble tes ventes et tes indicateurs. Choisis une période pour comprendre l’évolution de ta boutique.", english: "Overview brings together your sales and key metrics. Choose a date range to understand your store’s performance." },
  { target: "Vendeo AI", fr: "Pose tes questions à Vendeo AI", en: "Ask Vendeo AI", body: "L’assistant t’aide à comprendre tes données et à préparer tes prochaines actions. Commence par une question sur ta boutique.", english: "Your assistant helps you understand your data and plan your next steps. Start with a question about your store." },
  { target: "Studio", fr: "Crée tes visuels dans le Studio", en: "Create in the Studio", body: "Retrouve ici les outils de création pour tes produits. Vérifie les crédits et le coût indiqué avant de lancer une génération : ils sont distincts de ton abonnement.", english: "Find creative tools for your products here. Check the credits and displayed cost before generating: these are separate from your subscription." },
  { target: "Pub", fr: "Prépare et suis tes publicités", en: "Prepare and track your ads", body: "Pub te permet de préparer une campagne et de suivre tes publicités. Le bouton « Lancer une pub » ouvre le formulaire : vérifie toujours le budget avant de confirmer.", english: "Ads helps you prepare campaigns and track your ads. Launch ad opens the setup form: always review the budget before confirming." },
  { target: "Radar marché", fr: "Trouve de nouvelles pistes", en: "Explore new ideas", body: "Le Radar marché t’aide à explorer des idées pour ton activité. Utilise ces pistes pour nourrir ta réflexion, sans les considérer comme une garantie de ventes.", english: "Market radar helps you explore ideas for your business. Use them as inspiration, not as a guarantee of sales." },
  { target: "Bénéfices nets", fr: "Va au-delà du chiffre d’affaires", en: "Look beyond revenue", body: "Bénéfices nets t’aide à examiner la rentabilité avec les données disponibles. Sur mobile, retrouve cette section dans le menu à trois points.", english: "Net profit helps you review profitability using available data. On mobile, find this section in the three-dot menu." },
  { target: "Relances WhatsApp", fr: "Retrouve tes opportunités de relance", en: "Find follow-up opportunities", body: "Cette section rassemble les outils de relance WhatsApp. Consulte les informations et vérifie les destinataires avant toute action. Sur mobile, ouvre le menu à trois points.", english: "This section brings together WhatsApp follow-up tools. Review the information and recipients before taking action. On mobile, use the three-dot menu." },
  { target: "Pilotage auto", fr: "Garde le contrôle du pilotage", en: "Stay in control", body: "Le Pilotage auto rassemble les réglages de suivi et d’automatisation. Consulte les conditions et autorisations avant de l’activer : ce guide n’active rien.", english: "Autopilot brings together monitoring and automation settings. Review the conditions and permissions before enabling anything: this guide activates nothing." },
  { target: "Rapports", fr: "Retrouve tes analyses dans Rapports", en: "Review your reports", body: "Rapports permet de consulter les analyses de ta boutique. Sur mobile, ouvre le menu à trois points pour y accéder.", english: "Reports lets you review your store’s analyses. On mobile, open the three-dot menu to find it." },
  { target: "Suggestions et notes", fr: "Partage tes idées", en: "Share your ideas", body: "Suggestions et notes te permet de partager tes retours sur Vendeo. Tu peux aussi retrouver cette rubrique dans les Paramètres.", english: "Suggestions and feedback lets you share your ideas about Vendeo. You can also find it in Settings." },
  { target: "Abonnement", fr: "Tes connexions et ton compte", en: "Your connections and account", body: "Boutiques et Comptes pub servent à gérer tes connexions. Abonnement affiche ton essai et ses dates réelles ; Paramètres permet de personnaliser Vendeo. Sur mobile, utilise le profil ou le menu à trois points. Tu peux relancer ce guide avec le bouton « Guide » en haut de l’espace.", english: "Stores and Ad accounts manage your connections. Subscription shows your trial and its actual dates; Settings personalizes Vendeo. On mobile, use your profile or the three-dot menu. Restart this tour using Guide at the top of your workspace." },
] as const;

export function FirstStoreWelcome({ stage, subscription, onStart, onDismiss }: {
  stage: "welcome" | "tour";
  subscription: SubscriptionData | null;
  onStart: () => void;
  onDismiss: () => void;
}) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const current = VENDEO_TOUR_STEPS[step];
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => { dialog.current?.focus({ preventScroll: true }); }, [stage, step]);
  useEffect(() => {
    if (stage !== "tour") { setRect(null); setPosition(null); return; }
    function measure() {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>("[data-onboarding]"));
      let target = candidates.find(node => node.dataset.onboarding === current.target && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
      if (!target) target = document.querySelector<HTMLElement>(".mobile-more-trigger") ?? undefined;
      const box = target?.getBoundingClientRect();
      if (box && box.width && box.height && box.top >= 0 && box.bottom <= window.innerHeight) {
        setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
        const card = dialog.current?.getBoundingClientRect();
        if (card) {
          const gap = 18, edge = 16;
          const below = window.innerHeight - box.bottom - edge - gap;
          const above = box.top - edge - gap;
          let top = card.height <= below ? box.bottom + gap : card.height <= above ? box.top - card.height - gap : edge;
          let left = (window.innerWidth - card.width) / 2;
          // Wide layouts can place the card beside the navigation instead of over it.
          if (window.innerWidth > 767 && box.right + gap + card.width <= window.innerWidth - edge) {
            left = box.right + gap;
            top = Math.max(edge, Math.min(box.top, window.innerHeight - card.height - edge));
          }
          setPosition({ top: Math.max(edge, Math.min(top, window.innerHeight - card.height - edge)), left: Math.max(edge, left) });
        }
      } else { setRect(null); setPosition(null); }
    }
    measure();
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    if (dialog.current) observer.observe(dialog.current);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); observer.disconnect(); };
  }, [current.target, stage]);
  const trialEnd = subscription?.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
  const validEnd = trialEnd && Number.isFinite(trialEnd.getTime()) ? trialEnd : null;
  const trialActive = subscription?.trial_active === true && (!validEnd || validEnd.getTime() > Date.now());
  return <div className={`vendeo-welcome-layer ${stage === "tour" ? "vendeo-tour-layer" : ""}`}>
    <div className={`vendeo-welcome-shade ${rect ? "has-spotlight" : ""}`} />
    {stage === "tour" && rect && <div className="vendeo-tour-spotlight" aria-hidden="true" style={{ top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10 }} />}
    <section className="vendeo-welcome-card" style={stage === "tour" && position ? { position: "fixed", ...position, width: "min(460px, calc(100% - 32px))" } : undefined} role="dialog" aria-modal="true" aria-labelledby="vendeo-welcome-title" aria-describedby="vendeo-welcome-description" ref={dialog} tabIndex={-1} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); onDismiss(); }
      if (event.key !== "Tab") return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const first = buttons[0], last = buttons[buttons.length - 1];
      const outside = !buttons.includes(document.activeElement as HTMLButtonElement);
      if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first?.focus(); }
    }}>
      <button className="vendeo-welcome-close" type="button" onClick={onDismiss} aria-label={en ? "Close guide" : "Fermer le guide"}><X size={20} /></button>
      <span className="vendeo-welcome-brand"><img src="/vendeo-logo.webp" alt="Vendeo" width={112} height={30} /> <span>{en ? "FIRST STEPS" : "PREMIERS PAS"}</span></span>
      {stage === "welcome" ? <>
        <span className="vendeo-welcome-symbol"><PartyPopper size={32} aria-hidden="true" /></span>
        <span className="vendeo-welcome-connected"><Check size={14} aria-hidden="true" />{en ? "Store connected" : "Boutique connectée"}</span>
        <h2 id="vendeo-welcome-title">{en ? "Congratulations, you’re all set!" : "Félicitations, tout est prêt !"}</h2>
        <p id="vendeo-welcome-description">{en ? "Your first store is connected to Vendeo. Let’s explore your workspace together." : "Ta première boutique est connectée à Vendeo. Découvrons ensemble ton espace."}</p>
        <div className="vendeo-welcome-trial"><strong>{en ? "Your current free trial" : "Ton essai gratuit en cours"}</strong>
          <p>{trialActive ? (en ? "Enjoy your current free trial to discover Vendeo." : "Profite de ton essai gratuit en cours pour découvrir Vendeo.") : (en ? "New trials are 5 days. See Subscription for your current trial status." : "Les nouveaux essais durent 5 jours. Retrouve l’état actuel de ton essai dans Abonnement.")}</p>
          {validEnd && <small>{en ? "Trial end date: " : "Fin de l’essai : "}{validEnd.toLocaleDateString(en ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" })}</small>}
          <small>{en ? "Connecting a store does not restart or extend the trial. Studio credits and ad budgets are separate." : "La connexion ne redémarre ni ne prolonge l’essai. Les crédits Studio et le budget publicitaire sont distincts."}</small>
        </div>
        <button className="btn btn-dark vendeo-welcome-primary" type="button" onClick={onStart}>{en ? "Show me around" : "Découvrir mon espace"}<ArrowRight size={17} aria-hidden="true" /></button>
        <button className="vendeo-welcome-skip" type="button" onClick={onDismiss}>{en ? "Explore on my own" : "Explorer par moi-même"}</button>
      </> : <>
        <div className="vendeo-tour-progress" aria-label={en ? `Step ${step + 1} of ${VENDEO_TOUR_STEPS.length}` : `Étape ${step + 1} sur ${VENDEO_TOUR_STEPS.length}`}><span>{en ? "YOUR WORKSPACE" : "TON ESPACE"}</span><strong>{step + 1} / {VENDEO_TOUR_STEPS.length}</strong></div>
        <div className="vendeo-tour-track" aria-hidden="true"><span style={{ width: `${(step + 1) / VENDEO_TOUR_STEPS.length * 100}%` }} /></div>
        <h2 id="vendeo-welcome-title">{en ? current.en : current.fr}</h2>
        <p id="vendeo-welcome-description">{en ? current.english : current.body}</p>
        <div className="vendeo-tour-actions"><button type="button" className="vendeo-tour-back" disabled={step === 0} onClick={() => setStep(value => value - 1)}><ArrowLeft size={16} />{en ? "Back" : "Précédent"}</button>
          <button type="button" className="btn btn-dark" onClick={() => step === VENDEO_TOUR_STEPS.length - 1 ? onDismiss() : setStep(value => value + 1)}>{step === VENDEO_TOUR_STEPS.length - 1 ? (en ? "Let’s go!" : "C’est parti !") : (en ? "Next" : "Suivant")}<ArrowRight size={16} /></button></div>
        <button className="vendeo-welcome-skip" type="button" onClick={onDismiss}>{en ? "Skip the tour" : "Passer le guide"}</button>
      </>}
    </section>
  </div>;
}
