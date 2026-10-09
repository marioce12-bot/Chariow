"use client";

import { useState } from "react";
import { buildGeoTargeting } from "./types";
import type { WizardState } from "./types";
import { useI18n } from "@/lib/i18n/i18n";

interface StepProps {
  state: WizardState;
  patch: (p: Partial<WizardState>) => void;
  onNext: () => void;
  onBack: () => void;
}

/** Étape 4/5 — Budget et durée de la campagne.
 *
 * Cette étape ne simule pas la diffusion et n'affiche aucune portée ou
 * impression probable. Elle crée uniquement le brouillon réel qui sera ensuite
 * visible et modifiable dans la page Pub avant le lancement explicite.
 */
export function Step4Budget({ state, patch, onNext, onBack }: StepProps) {
  const { locale } = useI18n();
  const en = locale === "en";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discardDraft = () => {
    if (!state.campaignId) return;
    const staleCampaignId = state.campaignId;
    patch({ campaignId: null });
    fetch(`/api/ad-campaigns?id=${staleCampaignId}`, { method: "DELETE" }).catch(() => {});
  };

  const updateDailyBudget = (value: number) => {
    discardDraft();
    patch({ dailyBudget: value });
  };

  const updateDurationDays = (value: number) => {
    discardDraft();
    patch({ durationDays: value });
  };

  const createDraft = async () => {
    if (state.campaignId) {
      onNext();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const draftRes = await fetch("/api/ad-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: state.product?.id,
          product_name: state.product?.name,
          platform: state.platform,
          objective: state.objective,
          ad_set_name: state.adSetName,
          ad_name: state.adName,
          text: state.adText,
          title: state.title,
          link: state.destinationUrl,
          media_url: state.mediaUrl,
          countries: state.countries.join(","),
          geo_targeting: buildGeoTargeting(state.locations),
          minAge: state.minAge,
          maxAge: state.maxAge,
          daily_budget: state.dailyBudget,
          duration_days: state.durationDays,
          meta_ad_account_id: state.metaAdAccountId,
          meta_page_id: state.metaPageId,
          tiktok_ad_account_id: state.tiktokAdAccountId,
          pinterest_ad_account_id: state.pinterestAdAccountId,
        }),
      });
      const draftData = await draftRes.json();
      if (!draftRes.ok) throw new Error(draftData?.error || (en ? "Unable to create the campaign draft" : "Impossible de créer le brouillon"));
      patch({ campaignId: draftData.campaign.id });
      onNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : en ? "Unknown error" : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
          {en ? "Daily budget ($)" : "Budget quotidien ($)"}
        </label>
        <input
          type="number"
          min={1}
          step={0.5}
          value={state.dailyBudget}
          onChange={(e) => updateDailyBudget(Number(e.target.value))}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-700">
          {en ? "Duration (days)" : "Durée (jours)"}
        </label>
        <input
          type="number"
          min={1}
          max={90}
          value={state.durationDays}
          onChange={(e) => updateDurationDays(Number(e.target.value))}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400"
        />
      </div>

      <p className="text-xs text-gray-500">
        {en
          ? "The campaign will be saved as a draft. No ad is launched and no performance is simulated at this stage."
          : "La campagne sera enregistrée comme brouillon. Aucune publicité n'est lancée et aucune performance n'est simulée à cette étape."}
      </p>

      {error && <p className="text-sm text-[#991B1B]">{error}</p>}

      <div className="sticky bottom-0 -mx-5 mt-4 flex justify-between border-t border-gray-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button onClick={onBack} className="text-sm font-medium text-gray-500">
          {en ? "Back" : "Retour"}
        </button>
        <button
          disabled={loading}
          onClick={() => void createDraft()}
          className="rounded-lg bg-[#6366F1] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {loading ? (en ? "Saving…" : "Enregistrement…") : (en ? "Continue" : "Continuer")}
        </button>
      </div>
    </div>
  );
}
