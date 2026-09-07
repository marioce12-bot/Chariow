"use client";

import { Sparkles } from "lucide-react";

interface LaunchAdBarProps {
  onLaunch: () => void;
}

/**
 * Bloc 3 — Bannière d'incitation à créer une nouvelle campagne (ouvre le Wizard 5 étapes).
 */
export function LaunchAdBar({ onLaunch }: LaunchAdBarProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-base font-bold">Envie de lancer un nouveau produit ?</p>
        <p className="mt-0.5 text-sm text-white/85">
          Crée et lance une campagne Meta ou TikTok optimisée par l'IA en 2 minutes.
        </p>
      </div>
      <button
        onClick={onLaunch}
        className="flex shrink-0 items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-[#6366F1] transition hover:bg-white/90"
      >
        <Sparkles className="h-4 w-4" />
        Lancer une pub maintenant
      </button>
    </div>
  );
}
