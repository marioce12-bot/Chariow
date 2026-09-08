"use client";

import { useState } from "react";
import { formatXOF } from "../types";
import type { EstimateResult, WizardState } from "./types";

interface StepProps {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

/**
 * Étape 4/5 — Simulation (portée/impressions estimées) + budget brut & commission Vendeo 2%.
 * Crée le brouillon de campagne (POST /api/ad-campaigns, route existante) puis
 * demande une estimation indicative (POST /api/ad-campaigns/estimate, nouvelle route).
 *
 * Si le budget ou la durée changent APRÈS une simulation, l'estimation affichée
 * ne correspond plus aux champs — et surtout, le brouillon déjà créé en base
 * garde les anciennes valeurs, donc le paiement à l'étape 5 ne matcherait plus
 * ce qui est affiché ici. On invalide donc l'estimation ET le brouillon dès
 * qu'un des deux champs change, pour forcer une re-simulation propre.
 */
export function Step4Estimation({ state, patch, onNext, onBack }: StepProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);

  const invalidateEstimate = () => {
    if (estimate) setEstimate(null);
    if (state.campaignId) patch({ campaignId: null });
  };

  const updateDailyBudget = (value: number) => {
    invalidateEstimate();
    patch({ dailyBudget: value });
  };

  const updateDurationDays = (value: number) => {
    invalidateEstimate();
    patch({ durationDays: value });
  };

  const runEstimate = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1) Estimation indicative (n'écrit rien en base)
      const estRes = await fetch("/api/ad-campaigns/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: state.platform,
          daily_budget: state.dailyBudget,
          duration_days: state.durationDays,
          countries: state.countries,
        }),
      });
      const estData = await estRes.json();
      if (!estRes.ok) throw new Error(estData?.error || "Estimation indisponible");
      setEstimate(estData.estimate as EstimateResult);

      // 2) Crée le brouillon de campagne (toujours avec les valeurs actuelles :
      //    campaignId a été remis à null dès que budget/durée ont changé, donc
      //    on ne réutilise jamais un brouillon avec de vieux montants).
      if (!state.campaignId) {
        const draftRes = await fetch("/api/ad-campaigns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: state.product?.id,
            product_name: state.product?.name,
            platform: state.platform,
            objective: state.objective,
            text: state.adText,
            title: state.title,
            link: state.destinationUrl,
            media_url: state.mediaUrl,
            countries: state.countries.join(","),
            minAge: state.minAge,
            maxAge: state.maxAge,
            daily_budget: state.dailyBudget,
            duration_days: state.durationDays,
          }),
        });
        const draftData = await draftRes.json();
        if (!draftRes.ok) throw new Error(draftData?.error || "Impossible de créer le brouillon");
        patch({ campaignId: draftData.campaign.id });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
          Budget quotidien (XOF)
        </label>
        <input
          type="number"
          min={100}
          value={state.dailyBudget}
          onChange={(e) => updateDailyBudget(Number(e.target.value))}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
          Durée (jours)
        </label>
        <input
          type="number"
          min={1}
          max={90}
          value={state.durationDays}
          onChange={(e) => updateDurationDays(Number(e.target.value))}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />
      </div>

      {!estimate && (
        <button
          onClick={runEstimate}
          disabled={loading}
          className="w-full rounded-lg bg-[#EEF2FF] px-4 py-2.5 text-sm font-semibold text-[#3730A3] disabled:opacity-50"
        >
          {loading ? "Calcul en cours…" : "Simuler la campagne"}
        </button>
      )}

      {error && <p className="text-sm text-[#991B1B]">{error}</p>}

      {estimate && (
        <div className="space-y-3 rounded-2xl bg-[#EEF2FF] p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-[#4338CA]">Portée estimée</p>
              <p className="text-lg font-bold text-[#3730A3]">
                {estimate.reachMin.toLocaleString("fr-FR")}–{estimate.reachMax.toLocaleString("fr-FR")}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#4338CA]">Impressions estimées</p>
              <p className="text-lg font-bold text-[#3730A3]">
                {estimate.impressionsMin.toLocaleString("fr-FR")}–
                {estimate.impressionsMax.toLocaleString("fr-FR")}
              </p>
            </div>
          </div>
          <div className="border-t border-[#C7D2FE] pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Budget pub (98%)</span>
              <span className="font-medium text-gray-900">{formatXOF(estimate.netAdBudget)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Commission Vendeo (2%)</span>
              <span className="font-medium text-gray-900">{formatXOF(estimate.vendeoCommission)}</span>
            </div>
            <div className="mt-1 flex justify-between border-t border-[#C7D2FE] pt-1.5">
              <span className="font-semibold text-gray-900">Total à payer</span>
              <span className="font-bold text-[#3730A3]">{formatXOF(estimate.grossBudget)}</span>
            </div>
          </div>
          <p className="text-[11px] text-[#4338CA]/70">
            Estimation indicative — la portée réelle dépend de l'enchère Meta/TikTok au moment
            de la diffusion.
          </p>
        </div>
      )}

      <div className="sticky bottom-0 -mx-5 mt-4 flex justify-between border-t border-gray-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button onClick={onBack} className="text-sm font-medium text-gray-500">
          Retour
        </button>
        <button
          disabled={!estimate || !state.campaignId}
          onClick={onNext}
          className="rounded-lg bg-[#6366F1] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Continuer vers le paiement
        </button>
      </div>
    </div>
  );
}
