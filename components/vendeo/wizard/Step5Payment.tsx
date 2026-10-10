"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { WizardState } from "./types";
import { useI18n } from "@/lib/i18n/i18n";
import { campaignErrorMessage } from "@/lib/i18n/campaign-errors";
import { PINTEREST_TAG_REQUIRED_CODE, isPinterestConversionTagError, pinterestTagCopy } from "@/lib/pinterest/tag-help";

interface StepProps {
  state: WizardState;
  onBack?: () => void;
  onLaunched: (campaignId: string) => void;
  onCorrection?: (message: string | null) => void;
  initialStatus?: "draft" | "paused" | "autopilot_paused" | "paid";
  initialError?: string | null;
}

type Phase = "ready" | "launching" | "done" | "error" | "tag_required";

/**
 * Envoi de la campagne à Meta, TikTok ou Pinterest : la plateforme facture directement le
 * compte publicitaire sélectionné. Vendeo ne collecte pas le budget de campagne.
 *
 * Pinterest + objectif Ventes : si Pinterest refuse faute de balise (Pinterest Tag), on explique
 * comment la récupérer et l'installer sur Chariow, et on ne lance en Trafic QUE si l'utilisateur
 * le confirme explicitement (confirm_traffic_fallback).
 */
export function Step5Payment({ state, onBack, onLaunched, onCorrection, initialStatus, initialError }: StepProps) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [error, setError] = useState<string | null>(null);
  const [objectiveFallback, setObjectiveFallback] = useState(false);
  const [pixelAutoSelected, setPixelAutoSelected] = useState(false);
  const { locale, t } = useI18n();
  const platformLabel = state.platform === "meta" ? "Meta" : state.platform === "pinterest" ? "Pinterest" : "TikTok";
  const tagCopy = pinterestTagCopy(locale);

  useEffect(() => {
    if (initialError) {
      // Reprise d'une campagne Pinterest déjà refusée faute de balise : on rouvre directement l'explication.
      if (state.platform === "pinterest" && state.objective === "sales" && isPinterestConversionTagError(initialError)) {
        setPhase("tag_required");
        return;
      }
      setError(initialError);
      setPhase("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const launchCampaign = async (options?: { confirmTraffic?: boolean }) => {
    if (!state.campaignId) return;
    setPhase("launching");
    setError(null);
    try {
      const body =
        state.platform === "meta"
          ? { meta_ad_account_id: state.metaAdAccountId, page_id: state.metaPageId }
          : state.platform === "pinterest"
            ? { pinterest_ad_account_id: state.pinterestAdAccountId, confirm_traffic_fallback: options?.confirmTraffic === true }
            : { tiktok_ad_account_id: state.tiktokAdAccountId, identity_id: state.tiktokIdentityId, identity_type: state.tiktokIdentityType };
      const res = await fetch(`/api/ad-campaigns/${state.campaignId}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data?.code === PINTEREST_TAG_REQUIRED_CODE) {
          setPhase("tag_required");
          return;
        }
        throw new Error(data?.error || `${platformLabel} n'a pas accepté la campagne`);
      }
      setObjectiveFallback(Boolean(data.objective_fallback));
      setPixelAutoSelected(Boolean(data.pixel_auto_selected));
      setPhase("done");
      onLaunched(state.campaignId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setPhase("error");
    }
  };

  const whiteButtonStyle = { backgroundColor: "#FFFFFF", color: "#3730A3", borderColor: "#6366F1" } as const;

  return (
    <div className="space-y-4">
      {phase === "ready" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl bg-[#EEF2FF] p-4 text-sm text-[#3730A3]">
            <CheckCircle2 className="h-4 w-4 flex-none" />
            <span>{t("ads.budgetNotice")}</span>
          </div>
          {state.platform === "meta" && state.objective === "sales" ? (
            <div className="space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">{locale === "en" ? "Your campaign will be optimized for sales." : "Ta campagne sera optimisée pour les ventes."}</p>
              <p>{locale === "en" ? "Meta needs the pixel from your ad account for this. If no pixel is configured on this account, the campaign will still launch with the Traffic objective (page views), which may reduce results." : "Pour cela, Meta a besoin du pixel de ton compte publicitaire. Si aucun pixel n’est configuré sur ce compte, la campagne sera quand même lancée, mais avec l’objectif Trafic (vues de page). Les résultats seront alors moins bons."}</p>
              <p>{locale === "en" ? "For better results: copy the pixel from your Meta ad account and add it to your Chariow store." : "Pour de meilleurs résultats : prends le pixel de ton compte publicitaire Meta et ajoute-le dans ta boutique Chariow."}</p>
            </div>
          ) : null}
          {state.platform === "pinterest" && state.objective === "sales" ? (
            <div className="space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">{locale === "en" ? "Your campaign will be optimized for sales." : "Ta campagne sera optimisée pour les ventes."}</p>
              <p>{locale === "en" ? "Pinterest needs its tag (Pinterest Tag) installed on your Chariow store to see purchases. If it is missing, Pinterest will refuse the campaign: we will then explain how to install the tag, and we will only launch with the Traffic objective if you confirm." : "Pour cela, Pinterest a besoin de sa balise (Pinterest Tag) installée sur ta boutique Chariow pour voir les achats. Si elle manque, Pinterest refusera la campagne : nous t’expliquerons alors comment installer la balise, et nous ne lancerons en Trafic que si tu le confirmes."}</p>
            </div>
          ) : null}
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
          {objectiveFallback && state.platform === "pinterest" ? (
            <p className="mt-2 font-normal">{tagCopy.trafficDone}</p>
          ) : objectiveFallback ? (
            <p className="mt-2 font-normal">
              {locale === "en" ? "No pixel is configured on this ad account: your campaign launched with the Traffic objective (page views), so results may be lower. To optimize for sales next time, copy the pixel from your ad account and add it to your Chariow store." : "Aucun pixel n’est configuré sur ce compte publicitaire : ta campagne a été lancée avec l’objectif Trafic (vues de page) et ses résultats peuvent être moins bons. Pour optimiser sur les ventes la prochaine fois, prends le pixel de ton compte publicitaire et ajoute-le dans ta boutique Chariow."}
            </p>
          ) : null}
          {pixelAutoSelected ? (
            <p className="mt-2 font-normal">
              {locale === "en" ? "We used your ad account pixel to optimize for sales. Make sure it is added to your Chariow store, otherwise Meta will not see your purchases." : "Nous avons utilisé le pixel de ton compte publicitaire pour optimiser les ventes. Vérifie qu’il est bien ajouté dans ta boutique Chariow, sinon Meta ne verra pas tes achats."}
            </p>
          ) : null}
        </div>
      )}

      {phase === "tag_required" && (
        <div className="space-y-4 rounded-xl bg-[#FFFBEB] p-4 text-sm text-[#92400E]">
          <p className="font-semibold">{tagCopy.title}</p>
          <p>{tagCopy.intro}</p>

          <div className="space-y-2 rounded-lg bg-white/70 p-3">
            <p className="font-semibold">{tagCopy.optionTagTitle}</p>
            <p className="text-xs font-semibold uppercase tracking-wide">{tagCopy.pinterestTitle}</p>
            <ol className="list-decimal space-y-1 pl-5">
              {tagCopy.pinterestSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="pt-1 text-xs font-semibold uppercase tracking-wide">{tagCopy.chariowTitle}</p>
            <ol className="list-decimal space-y-1 pl-5" start={tagCopy.pinterestSteps.length + 1}>
              {tagCopy.chariowSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="pt-1 text-xs">{tagCopy.tagNote}</p>
          </div>

          <div className="space-y-1 rounded-lg bg-white/70 p-3">
            <p className="font-semibold">{tagCopy.optionTrafficTitle}</p>
            <p>{tagCopy.optionTrafficBody}</p>
          </div>

          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => void launchCampaign()} className="rounded-lg border border-[#6366F1] bg-white px-4 py-2 text-xs font-semibold text-[#3730A3]" style={whiteButtonStyle}>
              {tagCopy.retrySales}
            </button>
            <button type="button" onClick={() => void launchCampaign({ confirmTraffic: true })} className="rounded-lg bg-[#6366F1] px-4 py-2 text-xs font-semibold text-white">
              {tagCopy.confirmTraffic}
            </button>
            <button type="button" onClick={() => setPhase("ready")} className="rounded-lg border border-[#6366F1] bg-white px-4 py-2 text-xs font-semibold text-[#3730A3]" style={whiteButtonStyle}>
              {tagCopy.cancel}
            </button>
          </div>
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
              <button type="button" onClick={() => onCorrection(error)} className="rounded-lg border border-[#6366F1] bg-white px-4 py-2 text-xs font-semibold text-[#4338CA]" style={whiteButtonStyle}>
                {t("ads.correctCampaign")}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {onBack && phase !== "done" && (
        <div className="sticky bottom-0 -mx-5 mt-4 flex justify-between border-t border-gray-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button onClick={onBack} className="text-sm font-medium text-gray-500">
            {t("ads.back")}
          </button>
        </div>
      )}
    </div>
  );
}
