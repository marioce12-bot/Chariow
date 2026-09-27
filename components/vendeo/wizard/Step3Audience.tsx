"use client";

import { LocationSearchInput } from "./LocationSearchInput";
import { deriveCountries, type WizardState } from "./types";

interface StepProps {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

/**
 * Étape 3/5 — Ciblage & audience (pays/villes, tranche d'âge).
 * Le ciblage se fait via un widget de recherche façon Meta Ads Manager
 * (LocationSearchInput) : on tape un pays ou une ville, on sélectionne dans
 * les suggestions, le lieu devient une puce retirable. `countries` (liste de
 * codes pays dédupliqués) est dérivé automatiquement de `locations` à chaque
 * changement, pour rester compatible avec la colonne `countries text[]` et
 * avec TikTok qui ne cible que par pays.
 *
 * Le ciblage par centres d'intérêt IA n'est pas implémenté ici : Meta/TikTok
 * déterminent l'audience via l'objectif + le pixel/API de conversions déjà
 * en place plutôt qu'un champ "interests" manuel.
 */
export function Step3Audience({ state, patch, onNext, onBack }: StepProps) {
  const updateLocations = (locations: WizardState["locations"]) => {
    patch({ locations, countries: deriveCountries(locations) });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1.5 text-sm font-semibold text-gray-700">Pays ciblés</p>
        <LocationSearchInput
          value={state.locations}
          onChange={updateLocations}
          metaAccountId={state.metaAdAccountId}
          platform={state.platform}
        />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-gray-700">
          Tranche d'âge : {state.minAge} – {state.maxAge} ans
        </p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={13}
            max={65}
            value={state.minAge}
            onChange={(e) => patch({ minAge: Math.min(Number(e.target.value), state.maxAge) })}
            className="flex-1"
          />
          <input
            type="range"
            min={13}
            max={65}
            value={state.maxAge}
            onChange={(e) => patch({ maxAge: Math.max(Number(e.target.value), state.minAge) })}
            className="flex-1"
          />
        </div>
      </div>

      <div className="sticky bottom-0 -mx-5 mt-4 flex justify-between border-t border-gray-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button onClick={onBack} className="text-sm font-medium text-gray-500">
          Retour
        </button>
        <button
          onClick={onNext}
          className="rounded-lg bg-[#6366F1] px-5 py-2 text-sm font-semibold text-white"
        >
          Continuer
        </button>
      </div>
    </div>
  );
}
