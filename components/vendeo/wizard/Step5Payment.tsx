"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Wallet } from "lucide-react";
import type { WizardState } from "./types";
import { useI18n } from "@/lib/i18n/i18n";
import { campaignErrorMessage } from "@/lib/i18n/campaign-errors";

interface StepProps {
  state: WizardState;
  onBack?: () => void;
  onLaunched: (campaignId: string) => void;
  onCorrection?: (message: string | null) => void;
  initialStatus?: "draft" | "paused" | "autopilot_paused" | "paid";
  initialError?: string | null;
}

type Phase = "ready" | "launching" | "done" | "error" | "insufficient";

/**
 * Lancement de la campagne depuis le solde publicitaire. Plus aucun paiement au
 * lancement : le budget est prélevé sur le portefeuille Vendeo. Si le solde est
 * insuffisant, on affiche "Solde insuffisant" et on invite à recharger.
 */
export function Step5Payment({ state, onBack, onLaunched, onCorrection, initialStatus, initialError }: StepProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState<string | null>(null);
  const [insufficient, setInsufficient] = useState<{ balance: number; required: number } | null>(null);
  const [objectiveFallback, setObjectiveFallback] = useState(false);
  const { locale, t } = useI18n();
  const platformLabel = state.platform === "meta" ? "Meta" : "TikTok";
  const numberLocale = locale === "fr" ? "fr-FR" : "en-US";

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
      setObjectiveFallback(Boolean(data.objective_fallback));
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
            <span>{t("ads.budgetNotice")}</span>
          </div>
          {state.platform === "meta" && state.objective === "sales" ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Si aucun pixel Meta n’est marqué comme configuré sur Chariow, Vendeo lancera cette campagne avec l’objectif Trafic (vues de page) plutôt qu’avec l’optimisation Achats.</p> : null}
          {error && <p className="text-sm text-[#991B1B]">{campaignErrorMessage(error, locale, t, state.platform)}</p>}
          <button onClick={() => void launchCampaign()} className="w-full rounded-lg bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white">
            {t("ads.launchButton")}
          </button>
        </div>
      )}

      {phase === "launching" && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("ads.launching", { platform: platformLabel })}
        </div>
      )}

      {phase === "done" && (
        <div className="rounded-xl bg-[#ECFDF5] p-4 text-sm font-semibold text-[#065F46]">
          {t("ads.launchSuccess", { platform: platformLabel })}
          {objectiveFallback ? <p className="mt-2 font-normal">Aucun pixel d’achat configuré : la campagne utilise l’objectif Trafic (vues de page).</p> : null}
        </div>
      )}

      {phase === "insufficient" && (
        <div className="space-y-3 rounded-xl bg-[#FFFBEB] p-4 text-sm text-[#92400E]">
          <div className="flex items-center gap-2 font-semibold">
            <Wallet className="h-4 w-4" /> {t("ads.balanceInsufficient")}
          </div>
          <p>
            {t("ads.balanceDetails", { required: insufficient?.required.toLocaleString(numberLocale) ?? "0", balance: insufficient?.balance.toLocaleString(numberLocale) ?? "0" })}
          </p>
          <p className="text-xs">{t("ads.balanceHelp")}</p>
        </div>
      )}

      {phase === "error" && (
        <div className="space-y-3 rounded-xl bg-[#FFFBEB] p-4 text-sm text-[#92400E]">
          <p className="font-semibold">{t("ads.launchError", { platform: platformLabel })}</p>
          <p>{campaignErrorMessage(error, locale, t, state.platform)}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => void launchCampaign()} className="rounded-lg bg-[#6366F1] px-4 py-2 text-xs font-semibold text-white">
              {t("ads.retryLaunch")}
            </button>
            {onCorrection ? (
              <button type="button" onClick={() => onCorrection(error)} className="rounded-lg border border-[#6366F1] bg-white px-4 py-2 text-xs font-semibold text-[#4338CA]" style={{ backgroundColor: "#FFFFFF", color: "#3730A3", borderColor: "#6366F1" }}>
                {t("ads.correctCampaign")}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {onBack && !["done", "insufficient"].includes(phase) && (
        <div className="sticky bottom-0 -mx-5 mt-4 flex justify-between border-t border-gray-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={onBack} className="text-sm font-medium text-gray-500">
            {t("ads.back")}
          </button>
        </div>
      )}
    </div>
  );
}
