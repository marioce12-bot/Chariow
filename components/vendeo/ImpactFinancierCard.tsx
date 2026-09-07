"use client";

import { formatXOF, type ImpactFinancierData } from "./types";

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
        <p className="text-sm font-medium text-gray-500">Gaspillage évité</p>
        <p className="mt-1 text-3xl font-extrabold text-[#10B981]">
          +{formatXOF(data.budgetEconomise)}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Grâce aux pubs arrêtées à temps ce mois-ci.
        </p>
      </div>

      <div className="rounded-2xl border border-[#E0E7FF] bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-gray-500">Revenu additionnel estimé</p>
        <p className="mt-1 text-3xl font-extrabold text-[#6366F1]">
          +{formatXOF(data.revenuAdditionnelEstime)}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Si tu appliques les recommandations de Scale/Prix.
        </p>
      </div>
    </div>
  );
}
