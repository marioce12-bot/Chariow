"use client";

import { OctagonAlert, Rocket, Lightbulb, CheckCircle2 } from "lucide-react";
import { formatXOF, type VerdictBannerData } from "./types";

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
  if (data.verdict === "stop") {
    return (
      <div className="flex items-start gap-4 rounded-2xl border-l-4 border-[#EF4444] bg-[#FEF2F2] p-5">
        <OctagonAlert className="mt-0.5 h-8 w-8 shrink-0 text-[#EF4444]" strokeWidth={2.2} />
        <div className="flex-1">
          <h3 className="text-lg font-bold text-[#991B1B]">
            🛑 Action requise : Coupe {data.activeCampaignsCount ?? 1} publicité immédiatement
          </h3>
          <p className="mt-1 text-sm text-[#7F1D1D]">
            La campagne « {data.campaignName ?? "—"} » a dépensé {formatXOF(data.spend ?? 0)} sans
            générer aucune vente confirmée sur Chariow.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button
              onClick={onPrimaryAction}
              className="rounded-lg bg-[#991B1B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7F1D1D]"
            >
              Voir la pub à couper
            </button>
            <button
              onClick={onSecondaryAction}
              className="text-sm font-medium text-[#991B1B] underline underline-offset-2 hover:text-[#7F1D1D]"
            >
              Discuter avec l'IA de ce problème
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
            ✅ Opportunité : Scaler ta campagne la plus rentable
          </h3>
          <p className="mt-1 text-sm text-[#065F46]/90">
            La campagne « {data.bestCampaignName ?? "—"} » génère un ROAS de{" "}
            {(data.roas ?? 0).toFixed(1)}x. Augmente ton budget de +
            {formatXOF(data.suggestedBudgetIncrease ?? 0)}/jour pour capter environ{" "}
            {data.estimatedExtraSales ?? 0} ventes supplémentaires.
          </p>
          <div className="mt-3">
            <button
              onClick={onPrimaryAction}
              className="rounded-lg bg-[#10B981] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#059669]"
            >
              Scaler la campagne
            </button>
          </div>
        </div>
      </div>
    );
  }

  // stable
  return (
    <div className="flex items-start gap-4 rounded-2xl border-l-4 border-[#6366F1] bg-[#EEF2FF] p-5">
      <Lightbulb className="mt-0.5 h-8 w-8 shrink-0 text-[#6366F1]" strokeWidth={2.2} />
      <div className="flex-1">
        <h3 className="text-lg font-bold text-[#3730A3]">
          💡 Tes publicités tournent normalement
        </h3>
        <p className="mt-1 text-sm text-[#3730A3]/90">
          Aucune perte critique détectée. Tes {data.activeCampaignsCount ?? 0} campagnes actives
          sont rentables.
        </p>
        <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#4338CA]">
          <CheckCircle2 className="h-4 w-4" />
          Tout est sous contrôle
        </div>
      </div>
    </div>
  );
}
