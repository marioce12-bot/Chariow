"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import type { WizardState } from "./types";

interface StepProps {
  state: WizardState;
  onBack?: () => void;
  onLaunched: (campaignId: string) => void;
  /**
   * Statut déjà connu côté serveur quand on REPREND une campagne existante
   * (ex. depuis la liste "Mes campagnes") au lieu de venir de l'étape 4 du
   * wizard.
   * - undefined/"draft" → comportement par défaut : la campagne n'a jamais
   *   été envoyée à Meta/TikTok, on propose directement le paiement.
   * - "paid"   → paiement déjà confirmé (ex. onglet fermé avant la fin), il
   *   ne reste qu'à envoyer la campagne à Meta/TikTok.
   * - "paused" → compatibilité avec d'éventuelles campagnes créées sous
   *   l'ancien flux (gratuitement chez Meta avant paiement) : on propose le
   *   paiement comme pour "draft", /launch se charge ensuite d'activer la
   *   campagne déjà existante au lieu d'en recréer une nouvelle.
   */
  initialStatus?: "draft" | "paused" | "paid";
  /** Motif du dernier refus Meta/TikTok deja connu cote serveur (campagne
   *  reouverte depuis "Mes campagnes"). Affiche immediatement l'ecran
   *  "Reessayer" au lieu de "Lancer la campagne" comme si de rien n'etait. */
  initialError?: string | null;
}

type Phase =
  | "ready"            // prêt à payer (campagne encore un simple brouillon côté Vendeo)
  | "creating_checkout"
  | "waiting_payment"
  | "paid_ready"       // paiement confirmé, en attente du clic pour envoyer à Meta/TikTok
  | "launching"        // paiement confirmé, envoi à Meta/TikTok en cours
  | "done"
  | "error";            // erreur après paiement confirmé (le paiement N'est PAS perdu)

/**
 * Étape 5/5 — Paiement, puis envoi à Meta/TikTok.
 *
 * Pour que la capture d'écran de vérification Meta Business montre le bon
 * ordre des opérations, le paiement est demandé AVANT tout appel à Meta :
 *
 * 1) La campagne existe déjà côté Vendeo (brouillon créé à l'étape 4, jamais
 *    envoyé à Meta/TikTok).
 * 2) POST /api/ad-campaigns/[id]/checkout ouvre le paiement SasPay, puis on
 *    poll GET /api/ad-campaigns/[id]/status jusqu'à status === "paid".
 * 3) Une fois le paiement confirmé, POST /api/ad-campaigns/[id]/launch envoie
 *    RÉELLEMENT la campagne à Meta/TikTok (créée directement active). Si la
 *    plateforme publicitaire refuse, l'erreur est affichée et l'utilisateur
 *    peut réessayer sans jamais payer une seconde fois — le paiement reste
 *    acquis (statut "paid" conservé côté serveur).
 *
 * Ce composant est aussi utilisé hors du wizard (via ResumeCampaignModal) pour
 * reprendre une campagne déjà créée depuis la liste "Mes campagnes" — d'où
 * `initialStatus`.
 */
export function Step5Payment({ state, onBack, onLaunched, initialStatus, initialError }: StepProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const platformLabel = state.platform === "meta" ? "Meta" : "TikTok";

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (initialStatus === "paid" && initialError) {
      setError(initialError);
      setPhase("error");
    } else {
      setPhase(initialStatus === "paid" ? "paid_ready" : "ready");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startPayment = async () => {
    if (!state.campaignId) return;
    setPhase("creating_checkout");
    setError(null);
    try {
      const res = await fetch(`/api/ad-campaigns/${state.campaignId}/checkout`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Impossible de créer le paiement");
      setCheckoutUrl(data.checkout.url);
      window.open(data.checkout.url, "_blank", "noopener,noreferrer");
      setPhase("waiting_payment");
      pollRef.current = setInterval(async () => {
        const s = await fetch(`/api/ad-campaigns/${state.campaignId}/status`).then((r) => r.json());
        if (s?.status === "paid") {
          if (pollRef.current) clearInterval(pollRef.current);
          await launchCampaign();
        }
      }, 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setPhase("ready");
    }
  };

  const launchCampaign = async () => {
    if (!state.campaignId) return;
    setPhase("launching");
    setError(null);
    try {
      const body =
        state.platform === "meta"
          ? { meta_ad_account_id: state.metaAdAccountId, page_id: state.metaPageId }
          : {
              tiktok_ad_account_id: state.tiktokAdAccountId,
              identity_id: state.tiktokIdentityId,
              identity_type: state.tiktokIdentityType,
            };
      const res = await fetch(`/api/ad-campaigns/${state.campaignId}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `${platformLabel} n'a pas accepté la campagne`);
      setPhase("done");
      onLaunched(state.campaignId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setPhase("error");
    }
  };

  return (
    <div className="space-y-4">
      {phase === "ready" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-[#EEF2FF] p-4 text-sm text-[#3730A3]">
            <CheckCircle2 className="h-4 w-4 flex-none" />
            <span>Ta campagne est enregistrée sur Vendeo. Elle n'a pas encore été envoyée à {platformLabel}.</span>
          </div>
          <p className="text-sm text-gray-500">
            Le paiement couvre le budget publicitaire (98%) et la commission Vendeo (2%). Une fois le
            paiement confirmé, la campagne est envoyée automatiquement à {platformLabel}.
          </p>
          {error && <p className="text-sm text-[#991B1B]">{error}</p>}
          <button
            onClick={() => void startPayment()}
            className="w-full rounded-lg bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Payer et lancer la campagne
          </button>
        </div>
      )}

      {phase === "creating_checkout" && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Création du paiement…
        </div>
      )}

      {phase === "waiting_payment" && (
        <div className="space-y-2 rounded-xl bg-[#FFFBEB] p-4 text-sm text-[#92400E]">
          <div className="flex items-center gap-2 font-semibold">
            <Loader2 className="h-4 w-4 animate-spin" /> En attente du paiement…
          </div>
          <p>Termine le paiement dans l'onglet ouvert. Cette page se met à jour automatiquement.</p>
          {checkoutUrl && (
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium underline"
            >
              Rouvrir le paiement <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {phase === "paid_ready" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-[#ECFDF5] p-4 text-sm text-[#065F46]">
            <CheckCircle2 className="h-4 w-4 flex-none" />
            <span>Le paiement de cette campagne est confirmé. Il ne reste qu'à l'envoyer à {platformLabel}.</span>
          </div>
          {error && <p className="text-sm text-[#991B1B]">{error}</p>}
          <button
            onClick={() => void launchCampaign()}
            className="w-full rounded-lg bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Lancer la campagne
          </button>
        </div>
      )}

      {phase === "launching" && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Paiement confirmé — envoi à {platformLabel}…
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-xl bg-[#ECFDF5] p-4 text-sm font-semibold text-[#065F46]">
          ✅ Campagne envoyée à {platformLabel} ! Elle passe en revue avant diffusion.
        </div>
      )}

      {phase === "error" && (
        <div className="space-y-3 rounded-xl bg-[#FFFBEB] p-4 text-sm text-[#92400E]">
          <p className="font-semibold">Le paiement est confirmé, mais {platformLabel} n'a pas accepté la campagne.</p>
          <p>{error}</p>
          <p className="text-xs font-medium">Ton paiement n'est pas perdu — réessaie le lancement.</p>
          <button
            onClick={() => void launchCampaign()}
            className="rounded-lg bg-[#6366F1] px-4 py-2 text-xs font-semibold text-white"
          >
            Réessayer
          </button>
        </div>
      )}

      {onBack && !["done"].includes(phase) && (
        <div className="sticky bottom-0 -mx-5 mt-4 flex justify-between border-t border-gray-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={onBack} className="text-sm font-medium text-gray-500">
            Retour
          </button>
        </div>
      )}
    </div>
  );
}
