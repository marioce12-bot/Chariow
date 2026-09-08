"use client";

import { COUNTRY_OPTIONS, type WizardState } from "./types";

interface StepProps {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

/**
 * Étape 3/5 — Ciblage & audience (pays, tranche d'âge).
 * Le ciblage par centres d'intérêt IA n'est pas implémenté ici : Meta/TikTok
 * déterminent l'audience via l'objectif + le pixel/API de conversions déjà
 * en place plutôt qu'un champ "interests" manuel.
 */
export function Step3Audience({ state, patch, onNext, onBack }: StepProps) {
  const toggleCountry = (code: string) => {
    const has = state.countries.includes(code);
    const next = has ? state.countries.filter((c) => c !== code) : [...state.countries, code];
    patch({ countries: next.length ? next : ["BJ"] });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1.5 text-sm font-semibold text-gray-700">Pays ciblés</p>
        <div className="flex flex-wrap gap-2">
          {COUNTRY_OPTIONS.map((c) => {
            const active = state.countries.includes(c.code);
            return (
              <button
                key={c.code}
                onClick={() => toggleCountry(c.code)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active ? "border-[#6366F1] bg-[#EEF2FF] text-[#3730A3]" : "border-gray-200 text-gray-600"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
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

      <div className="sticky bottom-0 -mx-5 flex justify-between border-t border-gray-100 bg-white px-5 pb-1 pt-3">
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
