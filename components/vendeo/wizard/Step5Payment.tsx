"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Wallet } from "lucide-react";
import type { WizardState } from "./types";

interface StepProps {
  state: WizardState;
  onBack?: () => void;
  onLaunched: (campaignId: string) => void;
  initialStatus?: "draft" | "paused" | "paid";
  initialError?: string | null;
}

type Phase = "ready" | "launching" | "done" | "error" | "insufficient";

/**
 * Lancement de la campagne depuis le solde publicitaire. Plus aucun paiement au
 * lancement : le budget est prélevé sur le portefeuille Vendeo. Si le solde est
 * insuffisant, on affiche "Solde insuffisant" et on invite à recharger.
 */
export function Step5Payment({ state, onBack, onLaunched, initialStatus, initialError }: StepProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState<{ balance: number; required: number } | null>(null);
  const platformLabel = state.platform === "meta" ? "Meta" : "TikTok";

  useEffect(() => {
    if (initialError) {
      setError(initialError);
      setPhase("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const launchCampaign = async () => {
    if (!state.campaignId) return;
    setPhase("launching");
    setError(null);
    setInsufficient(null);
    try {
      const body =
        state.platform === "meta"
          ? { meta_ad_account_id: state.metaAdAccountId, page_id: state.metaPageId }
          : { tiktok_ad_account_id: state.tiktokAdAccountId, identity_id: state.tiktokIdentityId, identity_type: state.tiktokIdentityType };
      const res = await fetch(`/api/ad-campaigns/${state.campaignId}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402 && data.code === "insufficient_balance") {
        setInsufficient({ balance: Number(data.balance ?? 0), required: Number(data.required ?? 0) });
        setPhase("insufficient");
        return;
      }
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
            <span>Le budget de cette campagne sera prélevé sur ton solde publicitaire.</span>
          </div>
          {error && <p className="text-sm text-[#991B1B]">{error}</p>}
          <button onClick={() => void launchCampaign()} className="w-full rounded-lg bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white">
            Lancer la campagne
          </button>
        </div>
      )}

      {phase === "launching" && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Envoi à {platformLabel}…
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-xl bg-[#ECFDF5] p-4 text-sm font-semibold text-[#065F46]">
          ✅ Campagne envoyée à {platformLabel} ! Elle passe en revue avant diffusion.
        </div>
      )}

      {phase === "insufficient" && (
        <div className="space-y-3 rounded-xl bg-[#FFFBEB] p-4 text-sm text-[#92400E]">
          <div className="flex items-center gap-2 font-semibold">
            <Wallet className="h-4 w-4" /> Solde insuffisant
          </div>
          <p>
            Cette campagne nécessite <strong>{insufficient?.required.toLocaleString("fr-FR")} XOF</strong>, mais ton solde est de{" "}
            <strong>{insufficient?.balance.toLocaleString("fr-FR")} XOF</strong>.
          </p>
          <p className="text-xs">Recharge ton solde publicitaire depuis la carte « Solde publicitaire » de la page Pub, puis relance.</p>
        </div>
      )}

      {phase === "error" && (
        <div className="space-y-3 rounded-xl bg-[#FFFBEB] p-4 text-sm text-[#92400E]">
          <p className="font-semibold">{platformLabel} n'a pas accepté la campagne.</p>
          <p>{error}</p>
          <button onClick={() => void launchCampaign()} className="rounded-lg bg-[#6366F1] px-4 py-2 text-xs font-semibold text-white">
            Réessayer
          </button>
        </div>
      )}

      {onBack && !["done", "insufficient"].includes(phase) && (
        <div className="sticky bottom-0 -mx-5 mt-4 flex justify-between border-t border-gray-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={onBack} className="text-sm font-medium text-gray-500">
            Retour
          </button>
        </div>
      )}
    </div>
  );
}