"use client";

import { useEffect, useState } from "react";
import { LocationSearchInput } from "./LocationSearchInput";
import { deriveCountries, type WizardState } from "./types";
import type { MetaInterestTarget } from "@/lib/ad-campaigns/meta-targeting";
import { useI18n } from "@/lib/i18n/i18n";

interface StepProps {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

/** Étape 3/5 — Pays, âge et critères Meta facultatifs. */
export function Step3Audience({ state, patch, onNext, onBack }: StepProps) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [interestQuery, setInterestQuery] = useState("");
  const [interestResults, setInterestResults] = useState<MetaInterestTarget[]>([]);
  const [interestLoading, setInterestLoading] = useState(false);
  const selectedInterests = state.metaInterests ?? [];

  const updateLocations = (locations: WizardState["locations"]) => {
    patch({ locations, countries: deriveCountries(locations) });
  };

  useEffect(() => {
    const query = interestQuery.trim();
    if (state.platform !== "meta" || query.length < 2 || !state.metaAdAccountId) {
      setInterestResults([]);
      setInterestLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setInterestLoading(true);
      const params = new URLSearchParams({ q: query, account_id: state.metaAdAccountId! });
      fetch(`/api/integrations/meta/interest-search?${params}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : { results: [] })
        .then((data) => setInterestResults(Array.isArray(data.results) ? data.results : []))
        .catch(() => { if (!controller.signal.aborted) setInterestResults([]); })
        .finally(() => { if (!controller.signal.aborted) setInterestLoading(false); });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [interestQuery, state.metaAdAccountId, state.platform]);

  const addInterest = (option: MetaInterestTarget) => {
    if (selectedInterests.some((interest) => interest.id === option.id) || selectedInterests.length >= 10) return;
    patch({ metaInterests: [...selectedInterests, { id: option.id, name: option.name }] });
    setInterestQuery("");
    setInterestResults([]);
  };
  const removeInterest = (id: string) => patch({ metaInterests: selectedInterests.filter((interest) => interest.id !== id) });

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-1.5 text-sm font-semibold text-gray-700">{en ? "Target countries" : "Pays ciblés"}</p>
        <LocationSearchInput
          value={state.locations}
          onChange={updateLocations}
          metaAccountId={state.metaAdAccountId}
          platform={state.platform}
        />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-gray-700">
          {en ? "Age range" : "Tranche d'âge"} : {state.minAge} – {state.maxAge} {en ? "years" : "ans"}
        </p>
        <div className="flex items-center gap-3">
          <input type="range" aria-label={en ? "Minimum age" : "Âge minimum"} min={13} max={65} value={state.minAge} onChange={(e) => patch({ minAge: Math.min(Number(e.target.value), state.maxAge) })} className="flex-1" />
          <input type="range" aria-label={en ? "Maximum age" : "Âge maximum"} min={13} max={65} value={state.advantageAudience ? 65 : state.maxAge} onChange={(e) => patch({ maxAge: Math.max(Number(e.target.value), state.minAge) })} disabled={state.advantageAudience} className="flex-1 disabled:cursor-not-allowed disabled:opacity-50" />
        </div>
      </div>

      {state.platform === "meta" ? (
        <section className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/70 p-4" aria-label={en ? "Optional audience targeting" : "Ciblage facultatif de l’audience"}>
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">{en ? "Gender (optional)" : "Genre (facultatif)"}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                { value: null, label: en ? "All genders" : "Femmes et hommes" },
                { value: "female", label: en ? "Women only" : "Femmes uniquement" },
                { value: "male", label: en ? "Men only" : "Hommes uniquement" },
              ] as const).map((option) => (
                <label key={option.value ?? "all"} className={`flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm ${state.metaGender === option.value ? "border-indigo-500 ring-1 ring-indigo-200" : "border-gray-200"}`}>
                  <input type="radio" name="meta-gender-target" checked={state.metaGender === option.value} onChange={() => patch({ metaGender: option.value })} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-gray-500">{en ? "Meta does not offer sexual-orientation targeting." : "Meta ne propose pas de ciblage publicitaire par orientation sexuelle."}</p>
          </div>

          <div>
            <label htmlFor="meta-interest-search" className="mb-1.5 block text-sm font-semibold text-gray-700">
              {en ? "Interests (optional)" : "Centres d’intérêt (facultatif)"}
            </label>
            <p className="mb-2 text-xs text-gray-500">
              {en ? "Search Meta’s available interests, such as finance or personal development. Choose up to 10 or leave empty." : "Recherche parmi les centres d’intérêt proposés par Meta, comme la finance ou le développement personnel. Tu peux en choisir jusqu’à 10 ou ne rien sélectionner."}
            </p>
            <input
              id="meta-interest-search"
              type="search"
              value={interestQuery}
              onChange={(event) => setInterestQuery(event.target.value)}
              placeholder={en ? "Search an interest" : "Rechercher un centre d’intérêt"}
              autoComplete="off"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
              disabled={!state.metaAdAccountId}
            />
            {!state.metaAdAccountId ? <p className="mt-1 text-xs text-gray-500">{en ? "Select a Meta ad account to search its available interests." : "Sélectionne un compte Meta Ads pour rechercher les centres d’intérêt disponibles."}</p> : null}
            {interestQuery.trim().length >= 2 ? (
              <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white" role="listbox" aria-label={en ? "Meta interest suggestions" : "Suggestions de centres d’intérêt Meta"}>
                {interestLoading ? <p className="px-3 py-2 text-sm text-gray-500">{en ? "Searching Meta…" : "Recherche auprès de Meta…"}</p> : null}
                {!interestLoading && interestResults.length === 0 ? <p className="px-3 py-2 text-sm text-gray-500">{en ? "No Meta interests found." : "Aucun centre d’intérêt Meta trouvé."}</p> : null}
                {!interestLoading ? interestResults.filter((option) => !selectedInterests.some((selected) => selected.id === option.id)).map((option) => (
                  <button key={option.id} type="button" role="option" aria-selected="false" onClick={() => addInterest(option)} disabled={selectedInterests.length >= 10} className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-indigo-50 disabled:opacity-50">
                    {option.name}
                  </button>
                )) : null}
              </div>
            ) : null}
            {selectedInterests.length ? (
              <div className="mt-2 flex flex-wrap gap-2" aria-label={en ? "Selected interests" : "Centres d’intérêt sélectionnés"}>
                {selectedInterests.map((interest) => (
                  <span key={interest.id} className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800">
                    {interest.name}
                    <button type="button" onClick={() => removeInterest(interest.id)} aria-label={`${en ? "Remove" : "Retirer"} ${interest.name}`} className="font-bold">×</button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {state.platform === "meta" && (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3">
          <input type="checkbox" checked={state.advantageAudience} onChange={(e) => patch({ advantageAudience: e.target.checked, ...(e.target.checked ? { maxAge: 65 } : {}) })} className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="block text-sm font-semibold text-gray-700">{en ? "Advantage+ audience" : "Audience Advantage+"}</span>
            <span className="block text-xs text-gray-500">
              {state.advantageAudience
                ? (en ? "On: Meta may expand beyond your audience settings to find more buyers. Your locations are still respected, and the maximum age is fixed at 65." : "Activée : Meta peut élargir l’audience au-delà de tes critères pour trouver plus d’acheteurs. Tes lieux restent respectés et l’âge maximal est fixé à 65 ans.")
                : (en ? "Off: your ad uses the audience settings and locations you chose." : "Désactivée : ta publicité utilise les critères d’audience et les lieux que tu as choisis.")}
            </span>
          </span>
        </label>
      )}

      <div className="sticky bottom-0 -mx-5 mt-4 flex justify-between border-t border-gray-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button onClick={onBack} className="text-sm font-medium text-gray-500">{en ? "Back" : "Retour"}</button>
        <button onClick={onNext} className="rounded-lg bg-[#6366F1] px-5 py-2 text-sm font-semibold text-white">{en ? "Continue" : "Continuer"}</button>
      </div>
    </div>
  );
}
