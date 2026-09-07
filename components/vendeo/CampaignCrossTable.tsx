"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatXOF, type CampaignRow, type CampaignVerdictBadge } from "./types";

interface CampaignCrossTableProps {
  rows: CampaignRow[];
}

const VERDICT_STYLES: Record<CampaignVerdictBadge, { label: string; bg: string; text: string }> = {
  stop: { label: "🛑 STOP", bg: "bg-[#FEF2F2]", text: "text-[#991B1B]" },
  scale: { label: "✅ SCALE", bg: "bg-[#ECFDF5]", text: "text-[#065F46]" },
  test: { label: "⏳ EN TEST", bg: "bg-[#FFFBEB]", text: "text-[#92400E]" },
};

function VerdictBadge({ verdict }: { verdict: CampaignVerdictBadge }) {
  const style = VERDICT_STYLES[verdict];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${style.bg} ${style.text}`}
    >
      {style.label}
    </span>
  );
}

/**
 * Bloc 4 — Tableau de croisement Meta/TikTok ⚡ Chariow.
 * Sur desktop : tableau classique. Sur mobile : cartes accordéon.
 */
export function CampaignCrossTable({ rows }: CampaignCrossTableProps) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="text-base font-bold text-gray-900">
        Performances croisées & verdicts par campagne
      </h3>

      {/* Desktop */}
      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
              <th className="py-2 pr-4 font-medium">Campagne & produit</th>
              <th className="py-2 pr-4 font-medium">Audience ciblée</th>
              <th className="py-2 pr-4 font-medium">Dépense pub</th>
              <th className="py-2 pr-4 font-medium">Ventes réelles</th>
              <th className="py-2 pr-4 font-medium">Verdict</th>
              <th className="py-2 pr-4 font-medium">Action recommandée</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-50 align-top">
                <td className="py-3 pr-4">
                  <p className="font-semibold text-gray-900">{row.campaignName}</p>
                  <p className="text-xs text-gray-400">{row.productName}</p>
                </td>
                <td className="py-3 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {row.audienceTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 pr-4 font-medium text-gray-900">{formatXOF(row.spend)}</td>
                <td className="py-3 pr-4">
                  <p className="font-medium text-gray-900">{row.realSales} ventes</p>
                  <p className="text-xs text-gray-400">{formatXOF(row.realRevenue)}</p>
                </td>
                <td className="py-3 pr-4">
                  <VerdictBadge verdict={row.verdict} />
                </td>
                <td className="py-3 pr-4 text-gray-700">{row.recommendedAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile : cartes accordéon */}
      <div className="mt-4 space-y-2 md:hidden">
        {rows.map((row) => (
          <CampaignAccordionCard key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}

function CampaignAccordionCard({ row }: { row: CampaignRow }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-gray-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{row.campaignName}</p>
          <p className="truncate text-xs text-gray-400">{row.productName}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <VerdictBadge verdict={row.verdict} />
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {open && (
        <div className="space-y-2 border-t border-gray-50 p-3 text-sm">
          <div className="flex flex-wrap gap-1">
            {row.audienceTags.map((tag) => (
              <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {tag}
              </span>
            ))}
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Dépense pub</span>
            <span className="font-medium text-gray-900">{formatXOF(row.spend)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Ventes réelles</span>
            <span className="font-medium text-gray-900">
              {row.realSales} ({formatXOF(row.realRevenue)})
            </span>
          </div>
          <div className="rounded-lg bg-gray-50 p-2 text-gray-700">{row.recommendedAction}</div>
        </div>
      )}
    </div>
  );
}
