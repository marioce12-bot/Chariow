"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, ArrowRight, Brain, Check, PartyPopper, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";
import type { SubscriptionData } from "./shared";
import {
  DESKTOP_DASHBOARD_TOUR_STEPS,
  MOBILE_DASHBOARD_TOUR_STEPS,
  type DashboardTourStep,
} from "./tour-steps";
import "@/app/first-store-welcome.css";

export { VENDEO_TOUR_STEPS } from "./tour-steps";

const MOBILE_QUERY = "(max-width: 760px)";

function subscribeToViewport(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia?.(MOBILE_QUERY);
  if (media?.addEventListener) {
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }
  if (media?.addListener) {
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function getIsMobileSnapshot() {
  if (typeof window === "undefined") return false;
  return window.matchMedia ? window.matchMedia(MOBILE_QUERY).matches : window.innerWidth <= 760;
}

export function FirstStoreWelcome({ stage, subscription, onStart, onDismiss, onTourStepChange }: {
  stage: "welcome" | "tour";
  subscription: SubscriptionData | null;
  onStart: () => void;
  onDismiss: () => void;
  onTourStepChange: (step: DashboardTourStep | null) => void;
}) {
  const { locale } = useI18n();
  const en = locale === "en";
  const isMobile = useSyncExternalStore(subscribeToViewport, getIsMobileSnapshot, () => false);
  const tourSteps = isMobile ? MOBILE_DASHBOARD_TOUR_STEPS : DESKTOP_DASHBOARD_TOUR_STEPS;
  const [stepProfileMobile, setStepProfileMobile] = useState(isMobile);
  const isSwitchingProfile = stepProfileMobile !== isMobile;
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const onTourStepChangeRef = useRef(onTourStepChange);
  onTourStepChangeRef.current = onTourStepChange;
  const safeStep = Math.min(isSwitchingProfile ? 0 : step, tourSteps.length - 1);
  const current = tourSteps[safeStep];

  useEffect(() => {
    if (stepProfileMobile === isMobile) return;
    setStep(0);
    setStepProfileMobile(isMobile);
  }, [isMobile, stepProfileMobile]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus({ preventScroll: true });
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  useEffect(() => { dialog.current?.focus({ preventScroll: true }); }, [stage, safeStep]);
  useEffect(() => {
    if (stage !== "tour") return;
    onTourStepChange(current);
  }, [current, stage]);
  useEffect(() => () => { onTourStepChangeRef.current(null); }, []);

  useEffect(() => {
    if (stage !== "tour") { setRect(null); setPosition(null); return; }
    function measure() {
      const candidates = Array.from(document.querySelectorAll<HTMLElement>("[data-onboarding]"));
      const target = current.targetSelector
        ? document.querySelector<HTMLElement>(current.targetSelector)
        : candidates.find((node) => {
        if (node.dataset.onboarding !== current.target) return false;
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      });
      const box = target?.getBoundingClientRect();
      if (box && box.width && box.height && box.top >= 0 && box.bottom <= window.innerHeight) {
        setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
        const card = dialog.current?.getBoundingClientRect();
        if (card) {
          const gap = 18;
          const edge = 16;
          let top: number;
          let left = (window.innerWidth - card.width) / 2;
          if (isMobile && current.menuTarget) {
            const dockClearance = 104;
            const maxTop = window.innerHeight - card.height - dockClearance;
            const belowTop = box.bottom + gap;
            const aboveTop = box.top - card.height - gap;
            if (belowTop <= maxTop) top = belowTop;
            else if (aboveTop >= edge) top = aboveTop;
            else top = Math.max(edge, maxTop);
          } else {
            const below = window.innerHeight - box.bottom - edge - gap;
            const above = box.top - edge - gap;
            top = card.height <= below ? box.bottom + gap : card.height <= above ? box.top - card.height - gap : edge;
            if (!isMobile && box.right + gap + card.width <= window.innerWidth - edge) {
              left = box.right + gap;
              top = Math.max(edge, Math.min(box.top, window.innerHeight - card.height - edge));
            }
          }
          setPosition({
            top: Math.max(edge, Math.min(top, window.innerHeight - card.height - edge)),
            left: Math.max(edge, left),
          });
        }
      } else { setRect(null); setPosition(null); }
    }
    measure();
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(document.body);
    if (dialog.current) observer?.observe(dialog.current);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      observer?.disconnect();
    };
  }, [current.target, current.targetSelector, current.menuTarget, isMobile, stage]);

  const trialEnd = subscription?.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
  const validEnd = trialEnd && Number.isFinite(trialEnd.getTime()) ? trialEnd : null;
  const trialActive = subscription?.trial_active === true && (!validEnd || validEnd.getTime() > Date.now());
  function goToStep(nextStep: number) {
    const next = tourSteps[nextStep];
    if (!next) return;
    onTourStepChange(next);
    setStep(nextStep);
  }
  const welcomeDescription = en
    ? isMobile
      ? "Your first store is connected. We’ll follow the five mobile tabs in order; open the Assistant from the bottom dock."
      : "Your first store is connected. Let’s follow the desktop sidebar and top navigation together."
    : isMobile
      ? "Ta première boutique est connectée. Le parcours suit les cinq onglets mobiles dans l’ordre; l’Assistant est accessible depuis le dock du bas."
      : "Ta première boutique est connectée. Découvrons ensemble la navigation latérale et les outils en haut de l’écran.";
  const showAssistantGuideIcon = isMobile && stage === "tour" && current.id === "assistant";

  return <div className={`vendeo-welcome-layer ${stage === "tour" ? "vendeo-tour-layer" : ""} ${isMobile ? "vendeo-tour-mobile" : "vendeo-tour-desktop"} ${stage === "tour" && current.menuTarget ? "vendeo-tour-menu-step" : ""}`}>
    <div className={`vendeo-welcome-shade ${rect ? "has-spotlight" : ""}`} />
    {stage === "tour" && rect && <div className="vendeo-tour-spotlight" aria-hidden="true" style={{ top: rect.top - 5, left: rect.left - 5, width: rect.width + 10, height: rect.height + 10 }} />}
    <section className={`vendeo-welcome-card ${stage === "tour" && current.menuTarget ? "vendeo-tour-menu-card" : ""}`} style={stage === "tour" && position ? { position: "fixed", ...position, width: isMobile && current.menuTarget ? "min(380px, calc(100% - 32px))" : "min(460px, calc(100% - 32px))" } : undefined} role="dialog" aria-modal="true" aria-labelledby="vendeo-welcome-title" aria-describedby="vendeo-welcome-description" ref={dialog} tabIndex={-1} onKeyDown={event => {
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
        <p id="vendeo-welcome-description">{welcomeDescription}</p>
        <div className="vendeo-welcome-trial"><strong>{en ? "Your current free trial" : "Ton essai gratuit en cours"}</strong>
          <p>{trialActive ? (en ? "Enjoy your current free trial to discover Vendeo." : "Profite de ton essai gratuit en cours pour découvrir Vendeo.") : (en ? "New trials are 5 days. See Subscription for your current trial status." : "Les nouveaux essais durent 5 jours. Retrouve l’état actuel de ton essai dans Abonnement.")}</p>
          {validEnd && <small>{en ? "Trial end date: " : "Fin de l’essai : "}{validEnd.toLocaleDateString(en ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" })}</small>}
          <small>{en ? "Connecting a store does not restart or extend the trial. Studio credits and ad budgets are separate." : "La connexion ne redémarre ni ne prolonge l’essai. Les crédits Studio et le budget publicitaire sont distincts."}</small>
        </div>
        <button className="btn btn-dark vendeo-welcome-primary" type="button" onClick={onStart}>{en ? "Show me around" : "Découvrir mon espace"}<ArrowRight size={17} aria-hidden="true" /></button>
        <button className="vendeo-welcome-skip" type="button" onClick={onDismiss}>{en ? "Explore on my own" : "Explorer par moi-même"}</button>
      </> : <>
        <div className="vendeo-tour-progress" aria-label={en ? `Step ${safeStep + 1} of ${tourSteps.length}` : `Étape ${safeStep + 1} sur ${tourSteps.length}`}><span>{en ? "YOUR WORKSPACE" : "TON ESPACE"}</span><strong>{safeStep + 1} / {tourSteps.length}</strong></div>
        <div className="vendeo-tour-track" aria-hidden="true"><span style={{ width: `${(safeStep + 1) / tourSteps.length * 100}%` }} /></div>
        <h2 id="vendeo-welcome-title" className={showAssistantGuideIcon ? "vendeo-tour-assistant-title" : undefined}>
          {showAssistantGuideIcon && <span className="vendeo-tour-assistant-icon" aria-hidden="true"><Brain size={22} strokeWidth={2} /></span>}
          <span>{en ? current.en : current.fr}</span>
        </h2>
        <p id="vendeo-welcome-description">{en ? current.english : current.body}</p>
        <div className="vendeo-tour-actions"><button type="button" className="vendeo-tour-back" disabled={safeStep === 0} onClick={() => goToStep(safeStep - 1)}><ArrowLeft size={16} />{en ? "Back" : "Précédent"}</button>
          <button type="button" className="btn btn-dark" onClick={() => safeStep === tourSteps.length - 1 ? onDismiss() : goToStep(safeStep + 1)}>{safeStep === tourSteps.length - 1 ? (en ? "Let’s go!" : "C’est parti !") : (en ? "Next" : "Suivant")}<ArrowRight size={16} /></button></div>
        <button className="vendeo-welcome-skip" type="button" onClick={onDismiss}>{en ? "Skip the tour" : "Passer le guide"}</button>
      </>}
    </section>
  </div>;
}
