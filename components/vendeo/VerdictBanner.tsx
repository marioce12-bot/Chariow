"use client";

import { OctagonAlert, Rocket, Lightbulb, CheckCircle2 } from "lucide-react";
import { formatXOF, type VerdictBannerData } from "./types";
import { useI18n } from "@/lib/i18n/i18n";

interface VerdictBannerProps {
  data: VerdictBannerData;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
}

/**
 * Bloc 1 — Banner "Verdict Copilote".
 * Change entièrement d'apparence selon data.verdict (stop | scale | stable).
 */
export function VerdictBanner({ data, onPrimaryAction, onSecondaryAction }: VerdictBannerProps) {
  const { locale } = useI18n();
  const en = locale === "en";
  if (data.verdict === "stop") {
    return (
      <div className="flex items-start gap-4 rounded-2xl border-l-4 border-[#EF4444] bg-[#FEF2F2] p-5">
        <OctagonAlert className="mt-0.5 h-8 w-8 shrink-0 text-[#EF4444]" strokeWidth={2.2} />
        <div className="flex-1">
          <h3 className="text-lg font-bold text-[#991B1B]">
            🛑 {en ? `Profitability alert: check ${data.activeCampaignsCount ?? 1} campaign${(data.activeCampaignsCount ?? 1) > 1 ? "s" : ""} immediately` : `Alerte rentabilité : vérifie ${data.activeCampaignsCount ?? 1} campagne immédiatement`}
          </h3>
          <p className="mt-1 text-sm text-[#7F1D1D]">
            {en ? `Campaign “${data.campaignName ?? "—"}” spent ${formatXOF(data.spend ?? 0)} without generating a confirmed Chariow sale. Check your payment link, offer and tracking before letting the budget continue.` : `La campagne « ${data.campaignName ?? "—"} » a dépensé ${formatXOF(data.spend ?? 0)} sans générer de vente confirmée sur Chariow. Vérifie ton lien de paiement, ton offre et ton suivi avant de laisser le budget continuer.`}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button
              onClick={onPrimaryAction}
              className="rounded-lg bg-[#991B1B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7F1D1D]"
            >
              {en ? "View detected signal" : "Voir le signal détecté"}
            </button>
            <button
              onClick={onSecondaryAction}
              className="text-sm font-medium text-[#991B1B] underline underline-offset-2 hover:text-[#7F1D1D]"
            >
              {en ? "Discuss this issue with AI" : "Discuter avec l'IA de ce problème"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (data.verdict === "scale") {
    return (
      <div className="flex items-start gap-4 rounded-2xl border-l-4 border-[#10B981] bg-[#ECFDF5] p-5">
        <Rocket className="mt-0.5 h-8 w-8 shrink-0 text-[#10B981]" strokeWidth={2.2} />
        <div className="flex-1">
          <h3 className="text-lg font-bold text-[#065F46]">
            ✅ {en ? "Opportunity: scale your most profitable campaign" : "Opportunité : Scaler ta campagne la plus rentable"}
          </h3>
          <p className="mt-1 text-sm text-[#065F46]/90">
            {en ? `Campaign “${data.bestCampaignName ?? "—"}” generates a ROAS of ${(data.roas ?? 0).toFixed(1)}x. Increase your budget by +${formatXOF(data.suggestedBudgetIncrease ?? 0)}/day to capture about ${data.estimatedExtraSales ?? 0} additional sales.` : <>La campagne « {data.bestCampaignName ?? "—"} » génère un ROAS de {(data.roas ?? 0).toFixed(1)}x. Augmente ton budget de +{formatXOF(data.suggestedBudgetIncrease ?? 0)}/jour pour capter environ {data.estimatedExtraSales ?? 0} ventes supplémentaires.</>}
          </p>
          <div className="mt-3">
            <button
              onClick={onPrimaryAction}
              className="rounded-lg bg-[#10B981] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#059669]"
            >
              {en ? "Analyze the opportunity" : "Analyser l'opportunité"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // stable
  const activeCount = data.activeCampaignsCount ?? 0;
  const noActiveCampaigns = activeCount === 0;

  return (
    <div className="flex items-start gap-4 rounded-2xl border-l-4 border-[#6366F1] bg-[#EEF2FF] p-5">
      <Lightbulb className="mt-0.5 h-8 w-8 shrink-0 text-[#6366F1]" strokeWidth={2.2} />
      <div className="flex-1">
        <h3 className="text-lg font-bold text-[#3730A3]">
          {noActiveCampaigns ? (en ? "💡 No advertising signal to analyze" : "💡 Aucun signal publicitaire à analyser") : (en ? "💡 No critical signal detected" : "💡 Aucun signal critique détecté")}
        </h3>
        <p className="mt-1 text-sm text-[#3730A3]/90">
          {noActiveCampaigns
            ? (en ? "Connect Meta Ads or TikTok Ads to cross-reference their data with your store's confirmed sales." : "Connecte Meta Ads ou TikTok Ads pour croiser leurs données avec les ventes confirmées de ta boutique.")
            : (en ? `No critical loss detected across your ${activeCount} analyzed campaigns.` : `Aucune perte critique détectée sur tes ${activeCount} campagnes analysées.`)}
        </p>
        <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#4338CA]">
          <CheckCircle2 className="h-4 w-4" />
          {noActiveCampaigns ? (en ? "Nothing to monitor for now" : "Rien à surveiller pour l'instant") : (en ? "Everything is under control" : "Tout est sous contrôle")}
        </div>
      </div>
    </div>
  );
}
