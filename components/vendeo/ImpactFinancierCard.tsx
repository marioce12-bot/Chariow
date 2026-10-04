"use client";

import { formatAdMoney, type ImpactFinancierData } from "./types";

interface ImpactFinancierCardProps {
  data: ImpactFinancierData;
}

/**
 * Bloc 2 — "Impact Financier".
 * Remplace les blocs CA/Dépenses/ROAS traditionnels qui affichent souvent du vide.
 */
export function ImpactFinancierCard({ data }: ImpactFinancierCardProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded-2xl border border-[#D1FAE5] bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-gray-500">Dépense observée sur campagnes à risque</p>
        <p className="mt-1 text-3xl font-extrabold text-[#10B981]">
          {formatAdMoney(data.budgetEconomise, data.currency)}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Dépense déjà observée sur la période; ce montant n'est pas une économie réalisée.
        </p>
      </div>

      <div className="rounded-2xl border border-[#E0E7FF] bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-gray-500">Potentiel estimé selon le ROAS attribué</p>
        <p className="mt-1 text-3xl font-extrabold text-[#6366F1]">
          {formatAdMoney(data.revenuAdditionnelEstime, data.currency)}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Estimation indicative à partir des ventes Chariow attribuées; ce n'est pas un revenu garanti.
        </p>
      </div>
    </div>
  );
}
