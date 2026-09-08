"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import type { WizardState } from "./types";

interface StepProps {
  state: WizardState;
  onBack: () => void;
  onLaunched: (campaignId: string) => void;
}

type Phase = "idle" | "creating_checkout" | "waiting_payment" | "launching" | "done" | "error";

/**
 * Étape 5/5 — Paiement & lancement.
 *
 * 1) POST /api/ad-campaigns/[id]/checkout (nouvelle route) → ouvre le checkout SasPay.
 * 2) Poll GET /api/ad-campaigns/[id]/status (route existante) jusqu'à status === "paid"
 *    (le webhook SasPay met à jour ce statut, cf. INTEGRATION_WIZARD.md).
 * 3) POST /api/ad-campaigns/[id]/launch (route existante) pour soumettre réellement
 *    la campagne à Meta ou TikTok.
 */
export function Step5Payment({ state, onBack, onLaunched }: StepProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
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
      setPhase("error");
    }
  };

  const launchCampaign = async () => {
    if (!state.campaignId) return;
    setPhase("launching");
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
      if (!res.ok) throw new Error(data?.error || "Le lancement a échoué");
      setPhase("done");
      onLaunched(state.campaignId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setPhase("error");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Le paiement couvre le budget publicitaire (98%) et la commission Vendeo (2%). Une fois le
        paiement confirmé, la campagne est soumise automatiquement à{" "}
        {state.platform === "meta" ? "Meta" : "TikTok"}.
      </p>

      {phase === "idle" && (
        <button
          onClick={startPayment}
          className="w-full rounded-lg bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Payer et lancer la campagne
        </button>
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

      {phase === "launching" && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Paiement confirmé — soumission à{" "}
          {state.platform === "meta" ? "Meta" : "TikTok"}…
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-xl bg-[#ECFDF5] p-4 text-sm font-semibold text-[#065F46]">
          ✅ Campagne soumise ! Elle passe en revue avant diffusion.
        </div>
      )}

      {error && <p className="text-sm text-[#991B1B]">{error}</p>}

      {phase !== "done" && (
        <div className="sticky bottom-0 -mx-5 mt-4 flex justify-between border-t border-gray-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={onBack} className="text-sm font-medium text-gray-500">
            Retour
          </button>
        </div>
      )}
    </div>
  );
}
