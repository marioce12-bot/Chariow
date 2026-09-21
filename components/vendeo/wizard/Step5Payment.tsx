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
   * wizard. Permet de sauter directement à la bonne phase au lieu de relancer
   * /launch, ce qui est interdit une fois la campagne déjà créée chez
   * Meta/TikTok (voir la garde côté route : seuls "draft"/"error" acceptent
   * un nouvel appel à /launch).
   * - undefined/"draft"/"error" → comportement historique : on appelle /launch.
   * - "paused" → campagne déjà créée en pause, prête à payer.
   * - "paid"   → paiement déjà confirmé, il ne reste qu'à activer.
   */
  initialStatus?: "draft" | "error" | "paused" | "paid";
}

type Phase =
  | "testing"        // création gratuite chez Meta/TikTok en PAUSED, en cours
  | "test_error"      // la création gratuite a échoué — aucun paiement n'a eu lieu
  | "ready"           // créée en PAUSED avec succès, prête à être payée
  | "creating_checkout"
  | "waiting_payment"
  | "paid_ready"      // paiement déjà confirmé (repris depuis la liste), en attente du clic "Activer"
  | "activating"      // paiement confirmé, bascule PAUSED -> ACTIVE en cours
  | "done"
  | "error";           // erreur après paiement confirmé (le paiement N'est PAS perdu)

/**
 * Étape 5/5 — Vérification gratuite, puis paiement, puis activation.
 *
 * 1) POST /api/ad-campaigns/[id]/launch → crée la campagne chez Meta/TikTok en
 *    PAUSED (aucune dépense). Si Meta refuse (permission manquante, compte
 *    restreint…), l'utilisateur le voit ici, sans avoir payé un centime.
 * 2) Une fois la création réussie, POST /api/ad-campaigns/[id]/checkout ouvre le
 *    paiement SasPay, puis on poll GET /api/ad-campaigns/[id]/status jusqu'à
 *    status === "paid".
 * 3) POST /api/ad-campaigns/[id]/activate bascule la campagne déjà créée de
 *    PAUSED à ACTIVE — c'est ce basculement qui la soumet réellement à Meta.
 *
 * Ce composant est aussi utilisé hors du wizard (via ResumeCampaignModal) pour
 * reprendre une campagne déjà créée depuis la liste "Mes campagnes" — d'où
 * `initialStatus`, qui permet de sauter l'étape 1 (test gratuit) quand elle a
 * déjà réussi lors d'une session précédente.
 */
export function Step5Payment({ state, onBack, onLaunched, initialStatus }: StepProps) {
  const [phase, setPhase] = useState<Phase>("testing");
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const platformLabel = state.platform === "meta" ? "Meta" : "TikTok";

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (initialStatus === "paused") {
      // Déjà créée en pause lors d'un précédent passage — inutile (et interdit
      // côté API) de rappeler /launch, on propose directement le paiement.
      setPhase("ready");
    } else if (initialStatus === "paid") {
      // Paiement déjà confirmé mais l'activation n'était pas allée au bout
      // (onglet fermé, etc.) — on propose directement d'activer.
      setPhase("paid_ready");
    } else {
      void testLaunch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const testLaunch = async () => {
    if (!state.campaignId) return;
    setPhase("testing");
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
      if (!res.ok) throw new Error(data?.error || `${platformLabel} n'a pas accepté la création de la campagne`);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setPhase("test_error");
    }
  };

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
          await activateCampaign();
        }
      }, 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setPhase("ready");
    }
  };

  const activateCampaign = async () => {
    if (!state.campaignId) return;
    setPhase("activating");
    try {
      const res = await fetch(`/api/ad-campaigns/${state.campaignId}/activate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "L'activation a échoué");
      setPhase("done");
      onLaunched(state.campaignId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setPhase("error");
    }
  };

  return (
    <div className="space-y-4">
      {phase === "testing" && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Création de la campagne chez {platformLabel} (en pause, aucune dépense)…
        </div>
      )}

      {phase === "test_error" && (
        <div className="space-y-3 rounded-xl bg-[#FEF2F2] p-4 text-sm text-[#991B1B]">
          <p className="font-semibold">{platformLabel} n'a pas accepté la création de la campagne.</p>
          <p>{error}</p>
          <p className="text-xs font-medium">Aucun paiement n'a été effectué.</p>
          <button
            onClick={() => void testLaunch()}
            className="rounded-lg bg-[#6366F1] px-4 py-2 text-xs font-semibold text-white"
          >
            Réessayer
          </button>
        </div>
      )}

      {phase === "ready" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-[#ECFDF5] p-4 text-sm text-[#065F46]">
            <CheckCircle2 className="h-4 w-4 flex-none" />
            <span>
              Ta campagne est prête chez {platformLabel} (en pause). Aucun paiement n'a encore été effectué.
            </span>
          </div>
          <p className="text-sm text-gray-500">
            Le paiement couvre le budget publicitaire (98%) et la commission Vendeo (2%). Une fois le
            paiement confirmé, la campagne est activée automatiquement chez {platformLabel}.
          </p>
          {error && <p className="text-sm text-[#991B1B]">{error}</p>}
          <button
            onClick={() => void startPayment()}
            className="w-full rounded-lg bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Payer et activer la campagne
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
            <span>Le paiement de cette campagne est déjà confirmé. Il ne reste qu'à l'activer chez {platformLabel}.</span>
          </div>
          {error && <p className="text-sm text-[#991B1B]">{error}</p>}
          <button
            onClick={() => void activateCampaign()}
            className="w-full rounded-lg bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Activer la campagne
          </button>
        </div>
      )}

      {phase === "activating" && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Paiement confirmé — activation chez {platformLabel}…
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-xl bg-[#ECFDF5] p-4 text-sm font-semibold text-[#065F46]">
          ✅ Campagne activée ! Elle passe en revue avant diffusion.
        </div>
      )}

      {phase === "error" && (
        <div className="space-y-3 rounded-xl bg-[#FFFBEB] p-4 text-sm text-[#92400E]">
          <p className="font-semibold">Le paiement est confirmé, mais l'activation a échoué.</p>
          <p>{error}</p>
          <p className="text-xs font-medium">Ton paiement n'est pas perdu — réessaie l'activation.</p>
          <button
            onClick={() => void activateCampaign()}
            className="rounded-lg bg-[#6366F1] px-4 py-2 text-xs font-semibold text-white"
          >
            Réessayer l'activation
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
