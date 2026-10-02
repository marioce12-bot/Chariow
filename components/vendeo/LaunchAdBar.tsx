"use client";

import { Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n";

interface LaunchAdBarProps {
  onLaunch: () => void;
}

/**
 * Bloc 3 — Bannière d'incitation à créer une nouvelle campagne (ouvre le Wizard 5 étapes).
 */
export function LaunchAdBar({ onLaunch }: LaunchAdBarProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-base font-bold">{t("launch.title")}</p>
        <p className="mt-0.5 text-sm text-white/85">
          {t("launch.description")}
        </p>
      </div>
      <button
        onClick={onLaunch}
        className="flex shrink-0 items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-[#6366F1] transition hover:bg-white/90"
      >
        <Sparkles className="h-4 w-4" />
        {t("launch.button")}
      </button>
    </div>
  );
}
