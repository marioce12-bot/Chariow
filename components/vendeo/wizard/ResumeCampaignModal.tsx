"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Step5Payment } from "./Step5Payment";
import { DEFAULT_WIZARD_STATE, type Platform, type WizardState } from "./types";

interface ResumeCampaignModalProps {
  campaignId: string;
  platform: Platform;
  /** "draft"/"paused" = prête à lancer ; "paid" = déjà payée, prête à activer. */
  initialStatus: "draft" | "paused" | "paid";
  /** Motif du dernier refus Meta/TikTok, déjà enregistré côté serveur (le
   *  paiement reste "paid" après un refus — voir /api/ad-campaigns/[id]/launch).
   *  Affiché dès l'ouverture pour ne pas faire retenter l'utilisateur à l'aveugle. */
  initialError?: string | null;
  onClose: () => void;
  onLaunched: () => void;
}

/**
 * Reprend une campagne déjà créée (visible dans "Mes campagnes") sans repasser
 * par les étapes 1 à 4 du wizard : on a déjà tout ce qu'il faut en base
 * (campaignId, platform), et /checkout + /activate n'ont besoin de rien
 * d'autre. Rendu via portail comme LaunchAdWizard pour éviter les soucis de
 * positionnement `fixed` dans un conteneur avec overflow.
 */
export function ResumeCampaignModal({ campaignId, platform, initialStatus, initialError, onClose, onLaunched }: ResumeCampaignModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const state: WizardState = { ...DEFAULT_WIZARD_STATE, campaignId, platform };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/40 sm:items-center sm:justify-center">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[85vh] sm:max-w-md sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-900">
            {initialStatus === "paid" ? "Activer la campagne" : "Lancer la campagne"}
          </h2>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">
            Fermer
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          <Step5Payment state={state} initialStatus={initialStatus} initialError={initialError} onLaunched={onLaunched} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
