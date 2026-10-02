"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { LocationSearchInput } from "./LocationSearchInput";
import { COUNTRY_OPTIONS, deriveCountries, type GeoLocation } from "./types";

type CampaignForCorrection = {
  id: string;
  platform: "meta" | "tiktok";
  title?: string | null;
  ad_text?: string | null;
  destination_url?: string | null;
  countries?: string[] | null;
  external_error?: string | null;
};

type CorrectionUpdates = {
  title: string;
  ad_text: string;
  destination_url: string;
  countries?: string[];
};

interface CampaignCorrectionModalProps {
  campaign: CampaignForCorrection;
  onClose: () => void;
  onSaved: (updates: CorrectionUpdates) => void;
}

function toCountryLocations(countries?: string[] | null): GeoLocation[] {
  return (countries?.length ? countries : ["BJ"]).map((code) => {
    const countryCode = code.toUpperCase();
    const option = COUNTRY_OPTIONS.find((country) => country.code === countryCode);
    return { key: countryCode, name: option?.label ?? countryCode, type: "country", countryCode };
  });
}

export function CampaignCorrectionModal({ campaign, onClose, onSaved }: CampaignCorrectionModalProps) {
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState(campaign.title ?? "");
  const [text, setText] = useState(campaign.ad_text ?? "");
  const [destinationUrl, setDestinationUrl] = useState(campaign.destination_url ?? "");
  const [locations, setLocations] = useState<GeoLocation[]>(() => toCountryLocations(campaign.countries));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  async function saveCorrections() {
    setSaving(true);
    setError(null);
    const updates: CorrectionUpdates = {
      title,
      ad_text: text.trim(),
      destination_url: destinationUrl.trim(),
      ...(campaign.platform === "tiktok" ? { countries: deriveCountries(locations) } : {}),
    };
    try {
      const response = await fetch(`/api/ad-campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Impossible d’enregistrer les corrections.");
      onSaved(updates);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex flex-col bg-black/40 sm:items-center sm:justify-center">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-xs font-medium text-gray-400">Correction avant relance</p>
            <h2 className="text-base font-bold text-gray-900">Modifier la campagne</h2>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600">Fermer</button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5">
          {campaign.external_error ? (
            <div className="rounded-xl bg-[#FFFBEB] p-3 text-sm text-[#92400E]">
              <strong className="block">Motif à corriger</strong>
              <span>{campaign.external_error}</span>
            </div>
          ) : null}
          <label className="block text-sm font-semibold text-gray-700">
            Titre
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal" />
          </label>
          <label className="block text-sm font-semibold text-gray-700">
            Texte de la publicité
            <textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} required className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal" />
          </label>
          <label className="block text-sm font-semibold text-gray-700">
            Lien de destination
            <input type="url" value={destinationUrl} onChange={(event) => setDestinationUrl(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal" />
          </label>
          {campaign.platform === "tiktok" ? (
            <div>
              <p className="mb-1.5 text-sm font-semibold text-gray-700">Pays ciblés</p>
              <LocationSearchInput value={locations} onChange={setLocations} platform="tiktok" />
              <p className="mt-1.5 text-xs text-gray-500">Retire un pays refusé et choisis uniquement une destination proposée par ton compte TikTok Ads.</p>
            </div>
          ) : null}
          {error ? <p role="alert" className="text-sm text-[#991B1B]">{error}</p> : null}
        </div>
        <div className="flex shrink-0 justify-between gap-3 border-t border-gray-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={onClose} disabled={saving} className="text-sm font-medium text-gray-500 disabled:opacity-50">Annuler</button>
          <button type="button" onClick={() => void saveCorrections()} disabled={saving || !text.trim() || !destinationUrl.trim()} className="rounded-lg bg-[#6366F1] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {saving ? "Enregistrement…" : "Enregistrer et revenir au lancement"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
