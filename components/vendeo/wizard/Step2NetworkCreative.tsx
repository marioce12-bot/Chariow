"use client";

import { useEffect } from "react";
import type { Objective, Platform, WizardState } from "./types";

interface StepProps {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

const OBJECTIVES: { value: Objective; label: string }[] = [
  { value: "sales", label: "Ventes" },
  { value: "traffic", label: "Trafic" },
  { value: "engagement", label: "Engagement" },
  { value: "leads", label: "Leads" },
];

/**
 * Étape 2/5 — Réseau (Meta/TikTok), objectif, visuel et texte de l'annonce.
 *
 * NB : la sélection du compte Meta Ads (metaAdAccountId/metaPageId) ou du
 * compte TikTok Ads (tiktokAdAccountId/tiktokIdentityId) n'est pas gérée ici :
 * branche-la sur tes sélecteurs existants (ceux utilisés dans le flux actuel
 * de connexion Meta/TikTok) et passe les valeurs via `patch(...)`.
 */
export function Step2NetworkCreative({ state, patch, onNext, onBack }: StepProps) {
  // Pré-remplit le texte/titre/lien à partir du produit choisi à l'étape 1.
  useEffect(() => {
    if (state.product && !state.adText) {
      patch({
        adText: state.product.description?.slice(0, 200) ?? `Découvre ${state.product.name} 🔥`,
        title: state.product.name,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.product]);

  const canContinue =
    state.mediaUrl.trim().length > 0 &&
    state.adText.trim().length > 0 &&
    state.destinationUrl.trim().length > 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-semibold text-gray-700">Réseau</p>
        <div className="flex gap-2">
          {(["meta", "tiktok"] as Platform[]).map((p) => (
            <button
              key={p}
              onClick={() => patch({ platform: p })}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition ${
                state.platform === p
                  ? "border-[#6366F1] bg-[#EEF2FF] text-[#3730A3]"
                  : "border-gray-200 text-gray-600"
              }`}
            >
              {p === "meta" ? "Meta Ads" : "TikTok Ads"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-gray-700">Objectif</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {OBJECTIVES.map((o) => (
            <button
              key={o.value}
              onClick={() => patch({ objective: o.value })}
              className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
                state.objective === o.value
                  ? "border-[#6366F1] bg-[#EEF2FF] text-[#3730A3]"
                  : "border-gray-200 text-gray-600"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
          Visuel (image ou vidéo)
        </label>
        <input
          value={state.mediaUrl}
          onChange={(e) => patch({ mediaUrl: e.target.value })}
          placeholder="https://…"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">
          Colle l'URL renvoyée par ton upload existant (route <code>/api/uploads</code>).
        </p>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Titre</label>
        <input
          value={state.title}
          onChange={(e) => patch({ title: e.target.value })}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
          Texte de l'annonce
        </label>
        <textarea
          value={state.adText}
          onChange={(e) => patch({ adText: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
          Lien de destination
        </label>
        <input
          value={state.destinationUrl}
          onChange={(e) => patch({ destinationUrl: e.target.value })}
          placeholder="https://ta-boutique.chariow.com/produit/…"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="text-sm font-medium text-gray-500">
          Retour
        </button>
        <button
          disabled={!canContinue}
          onClick={onNext}
          className="rounded-lg bg-[#6366F1] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Continuer
        </button>
      </div>
    </div>
  );
}
