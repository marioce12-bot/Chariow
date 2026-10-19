"use client";

import { localizeSystemMessage } from "@/lib/i18n/system-messages";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { Step5Payment } from "./Step5Payment";
import { DEFAULT_WIZARD_STATE, type Platform, type WizardState } from "./types";
import { useI18n } from "@/lib/i18n/i18n";

interface ResumeCampaignModalProps {
  campaignId: string;
  platform: Platform;
  /** Tous les états acceptés ici reprennent le lancement direct; `paid` est conservé pour compatibilité historique. */
  initialStatus: "draft" | "paused" | "autopilot_paused" | "paid";
  /** Motif du dernier refus Meta/TikTok, déjà enregistré côté serveur (le
   *  paiement reste "paid" après un refus — voir /api/ad-campaigns/[id]/launch).
   *  Affiché dès l'ouverture pour ne pas faire retenter l'utilisateur à l'aveugle. */
  initialError?: string | null;
  onClose: () => void;
  onCorrection: (message: string | null) => void;
  onLaunched: () => void;
}

/**
 * Reprend une campagne déjà créée (visible dans "Mes campagnes") sans repasser
 * par les étapes 1 à 4 du wizard : on a déjà tout ce qu'il faut en base
 * (campaignId, platform), et /launch effectue la reprise côté plateforme.
 * Rendu via portail comme LaunchAdWizard pour éviter les soucis de
 * positionnement `fixed` dans un conteneur avec overflow.
 */
export function ResumeCampaignModal({ campaignId, platform, initialStatus, initialError, onClose, onCorrection, onLaunched }: ResumeCampaignModalProps) {
  const [mounted, setMounted] = useState(false);
  const [launching, setLaunching] = useState(false);
  const launchingRef = useRef(false);
  const onLaunchingChange = (value: boolean) => {
    launchingRef.current = value;
    setLaunching(value);
  };
  const { t , locale } = useI18n();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const state: WizardState = { ...DEFAULT_WIZARD_STATE, campaignId, platform };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/40 sm:items-center sm:justify-center">
      <div role="dialog" aria-modal="true" aria-labelledby="wizard-launch-title" aria-busy={launching} className="flex h-full w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[85vh] sm:max-w-md sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 id="wizard-launch-title" className="text-base font-bold text-gray-900">
            {t("ads.launchButton")}
          </h2>
          <button disabled={launching} onClick={() => { if (!launchingRef.current) onClose(); }} className="text-sm text-gray-400 hover:text-gray-600 disabled:opacity-40">
            {t("ads.correction.close")}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          <Step5Payment state={state} initialStatus={initialStatus} initialError={localizeSystemMessage(initialError, locale)} onCorrection={onCorrection} onLaunched={onLaunched} onLaunchingChange={onLaunchingChange} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
