"use client";

import { Info } from "lucide-react";
import { formatAdMoney, type ImpactFinancierData } from "./types";
import { useI18n } from "@/lib/i18n/i18n";

interface ImpactFinancierCardProps {
  data: ImpactFinancierData;
}

export function ImpactFinancierCard({ data }: ImpactFinancierCardProps) {
  const { locale } = useI18n();
  const en = locale === "en";
  const help = en
    ? "Observed spend on at-risk campaigns. This amount is not savings already realized."
    : "Dépense observée sur les campagnes à risque. Ce montant n’est pas une économie réalisée.";
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="rounded-2xl border border-[#D1FAE5] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><p className="text-sm font-medium text-gray-500">{en ? "Observed spend" : "Dépense observée"}</p><span title={help} aria-label={help}><Info className="h-4 w-4 text-gray-500" /></span></div>
        <p className="mt-1 text-3xl font-extrabold text-[#10B981]">{formatAdMoney(data.budgetEconomise, data.currency)}</p>
        <span className="text-xs text-gray-500">{en ? "At-risk campaigns" : "Campagnes à risque"}</span>
      </div>
    </div>
  );
}
