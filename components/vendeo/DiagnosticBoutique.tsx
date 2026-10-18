"use client";

import { Tag, AlertTriangle, Users, Info } from "lucide-react";
import type { DiagnosticCard, DiagnosticType } from "./types";
import { useI18n } from "@/lib/i18n/i18n";

interface DiagnosticBoutiqueProps {
  cards: DiagnosticCard[];
}

const TYPE_META: Record<
  DiagnosticType,
  { icon: typeof Tag; labelKey: string; bg: string; text: string; iconColor: string }
> = {
  price_up: {
    icon: Tag,
    labelKey: "analysisExtra.diag.price",
    bg: "bg-[#EEF2FF]",
    text: "text-[#3730A3]",
    iconColor: "text-[#6366F1]",
  },
  checkout_alert: {
    icon: AlertTriangle,
    labelKey: "analysisExtra.diag.checkout",
    bg: "bg-[#FFFBEB]",
    text: "text-[#92400E]",
    iconColor: "text-[#F59E0B]",
  },
  audience: {
    icon: Users,
    labelKey: "analysisExtra.diag.audience",
    bg: "bg-[#EEF2FF]",
    text: "text-[#3730A3]",
    iconColor: "text-[#6366F1]",
  },
  info: {
    icon: Info,
    labelKey: "analysisExtra.diag.info",
    bg: "bg-gray-50",
    text: "text-gray-700",
    iconColor: "text-gray-400",
  },
};

/**
 * Bloc 5 — "Diagnostic Boutique & Prix Chariow".
 */
export function DiagnosticBoutique({ cards }: DiagnosticBoutiqueProps) {
  const { t } = useI18n();
  if (cards.length === 0) return null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h3 className="text-base font-bold text-gray-900">
        {t("analysisExtra.diag.title")}
      </h3>
      <div className="mt-4 space-y-3">
        {cards.map((card) => {
          const meta = TYPE_META[card.type];
          const Icon = meta.icon;
          return (
            <div key={card.id} className={`rounded-xl p-4 ${meta.bg}`}>
              <div className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${meta.iconColor}`} />
                <div className="flex-1">
                  <p className={`text-xs font-semibold ${meta.text}`}>{t(meta.labelKey)}</p>
                  <p className="mt-1 text-sm text-gray-700">{card.description}</p>
                  {card.actionLabel && (
                    <button
                      onClick={card.onAction}
                      className={`mt-2 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold shadow-sm ${meta.text}`}
                    >
                      {card.actionLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
