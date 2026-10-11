"use client";

import { CheckCircle2, Info, Lightbulb, OctagonAlert, Rocket } from "lucide-react";
import { formatXOF, type VerdictBannerData } from "./types";
import { useI18n } from "@/lib/i18n/i18n";

interface VerdictBannerProps {
  data: VerdictBannerData;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
}

export function VerdictBanner({ data, onPrimaryAction, onSecondaryAction }: VerdictBannerProps) {
  const { locale } = useI18n();
  const en = locale === "en";
  const infoTitle = en
    ? "Profitability uses verified net sales linked to campaigns launched from Vendeo."
    : "La rentabilité repose sur les ventes nettes vérifiées et reliées aux campagnes lancées depuis Vendeo.";
  const info = <span title={infoTitle} aria-label={infoTitle}><Info className="h-4 w-4" /></span>;

  if (data.verdict === "stop") {
    return (
      <div className="flex items-start gap-4 rounded-2xl border-l-4 border-[#EF4444] bg-[#FEF2F2] p-5">
        <OctagonAlert className="mt-0.5 h-8 w-8 shrink-0 text-[#EF4444]" strokeWidth={2.2} />
        <div className="flex-1">
          <div className="flex items-center gap-2"><h3 className="text-lg font-bold text-[#991B1B]">{en ? "Profitability check" : "Rentabilité à vérifier"}</h3>{info}</div>
          <p className="mt-1 text-sm text-[#7F1D1D]">{data.campaignName ?? (en ? "Campaign" : "Campagne")} · {formatXOF(data.spend ?? 0)} · {en ? "0 linked sales" : "0 vente liée"}</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <button onClick={onPrimaryAction} className="rounded-lg bg-[#991B1B] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7F1D1D]">{en ? "View signal" : "Voir le signal"}</button>
            <button onClick={onSecondaryAction} className="text-sm font-medium text-[#991B1B] underline underline-offset-2 hover:text-[#7F1D1D]">{en ? "Open AI" : "Ouvrir l’IA"}</button>
          </div>
        </div>
      </div>
    );
  }

  if (data.verdict === "scale") {
    const profitability = data.roas === null || data.roas === undefined ? "-" : `${(data.roas * 100).toFixed(1)} %`;
    return (
      <div className="flex items-start gap-4 rounded-2xl border-l-4 border-[#10B981] bg-[#ECFDF5] p-5">
        <Rocket className="mt-0.5 h-8 w-8 shrink-0 text-[#10B981]" strokeWidth={2.2} />
        <div className="flex-1">
          <div className="flex items-center gap-2"><h3 className="text-lg font-bold text-[#065F46]">{en ? "Positive profitability" : "Rentabilité favorable"}</h3>{info}</div>
          <p className="mt-1 text-sm text-[#065F46]/90">{data.bestCampaignName ?? (en ? "Campaign" : "Campagne")} · {en ? "Profitability" : "Rentabilité"} · {profitability}</p>
          <div className="mt-3"><button onClick={onPrimaryAction} className="rounded-lg bg-[#10B981] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#059669]">{en ? "Analyze" : "Analyser"}</button></div>
        </div>
      </div>
    );
  }

  const activeCount = data.activeCampaignsCount ?? 0;
  const noActiveCampaigns = activeCount === 0;
  return (
    <div className="flex items-start gap-4 rounded-2xl border-l-4 border-[#6366F1] bg-[#EEF2FF] p-5">
      <Lightbulb className="mt-0.5 h-8 w-8 shrink-0 text-[#6366F1]" strokeWidth={2.2} />
      <div className="flex-1">
        <div className="flex items-center gap-2"><h3 className="text-lg font-bold text-[#3730A3]">{noActiveCampaigns ? (en ? "No ad signal" : "Aucun signal pub") : (en ? "No critical alert" : "Aucune alerte critique")}</h3><CheckCircle2 className="h-4 w-4" /></div>
        <p className="mt-1 text-sm text-[#3730A3]/90">{en ? "Tracked campaigns" : "Campagnes suivies"} · {activeCount}</p>
      </div>
    </div>
  );
}
