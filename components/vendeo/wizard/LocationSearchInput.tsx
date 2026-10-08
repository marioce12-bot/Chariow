"use client";

import { useEffect, useRef, useState } from "react";
import { X, Search, Globe2, MapPin, Building2 } from "lucide-react";
import { searchCountries } from "@/lib/geo/countries";
import type { GeoLocation } from "./types";

interface LocationSearchInputProps {
  value: GeoLocation[];
  onChange: (locations: GeoLocation[]) => void;
  /** La recherche de villes/régions Meta n'a de sens que pour une campagne Meta
   *  (TikTok ne partage pas les mêmes identifiants de lieu) — sur TikTok, seule
   *  la recherche par pays reste proposée. */
  metaAccountId?: string | null;
  platform: "meta" | "tiktok" | "pinterest";
}

interface Suggestion {
  key: string;
  name: string;
  type: "country" | "region" | "city";
  countryCode: string;
}

const TYPE_ICON: Record<Suggestion["type"], typeof Globe2> = {
  country: Globe2,
  region: MapPin,
  city: Building2,
};

const TYPE_LABEL: Record<Suggestion["type"], string> = {
  country: "Pays",
  region: "Région",
  city: "Ville",
};

/**
 * Widget de recherche d'audience façon Meta Ads Manager : on tape un pays ou
 * une ville, une liste de suggestions apparaît, on clique pour l'ajouter ;
 * chaque lieu sélectionné devient une puce retirable en dessous. Remplace
 * l'ancienne grille figée de 9 pays d'Afrique de l'Ouest.
 *
 * Les pays viennent d'une liste locale (recherche instantanée, aucun réseau).
 * Les villes/régions viennent de l'API de recherche de lieux de Meta
 * (/api/integrations/meta/geo-search), interrogée uniquement si un compte
 * Meta Ads est connecté — sinon (ou sur TikTok) seuls les pays remontent.
 */
export function LocationSearchInput({ value, onChange, metaAccountId, platform }: LocationSearchInputProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [remoteSuggestions, setRemoteSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2 || platform !== "meta" || !metaAccountId) {
      setRemoteSuggestions([]);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/integrations/meta/geo-search?q=${encodeURIComponent(q)}&account_id=${encodeURIComponent(metaAccountId)}`);
        const data = await res.json().catch(() => ({}));
        if (requestId !== requestIdRef.current) return; // réponse obsolète (une requête plus récente est partie entre-temps)
        setRemoteSuggestions(res.ok && Array.isArray(data.results) ? (data.results as Suggestion[]) : []);
      } catch {
        if (requestId === requestIdRef.current) setRemoteSuggestions([]);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, metaAccountId, platform]);

  const localCountrySuggestions: Suggestion[] = searchCountries(query, 6).map((c) => ({
    key: c.code,
    name: c.label,
    type: "country",
    countryCode: c.code,
  }));

  // Les pays locaux d'abord (recherche instantanée), puis les régions/villes
  // Meta ; on retire les doublons (une ville dont le nom matche aussi un pays).
  const selectedKeys = new Set(value.map((l) => l.key));
  const suggestions = [...localCountrySuggestions, ...remoteSuggestions]
    .filter((s, i, arr) => arr.findIndex((o) => o.key === s.key) === i)
    .filter((s) => !selectedKeys.has(s.key));

  const addLocation = (s: Suggestion) => {
    onChange([...value, { key: s.key, name: s.name, type: s.type, countryCode: s.countryCode }]);
    setQuery("");
    setRemoteSuggestions([]);
  };

  const removeLocation = (key: string) => {
    const next = value.filter((l) => l.key !== key);
    // Toujours garder au moins un pays ciblé (comme avant : plus aucune audience
    // sélectionnée n'aurait aucun sens pour Meta/TikTok).
    onChange(next.length ? next : [{ key: "BJ", name: "Bénin", type: "country", countryCode: "BJ" }]);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher un pays ou une ville…"
          className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400"
        />
      </div>

      {open && query.trim().length > 0 && (
        <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-100 bg-white shadow-lg">
          {suggestions.length === 0 && !loading && (
            <p className="px-3 py-2.5 text-sm text-gray-400">Aucun résultat pour « {query} »</p>
          )}
          {suggestions.map((s) => {
            const Icon = TYPE_ICON[s.type];
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => addLocation(s)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-[#EEF2FF]"
              >
                <Icon className="h-4 w-4 shrink-0 text-[#6366F1]" />
                <span className="flex-1 truncate">{s.name}</span>
                <span className="shrink-0 text-xs text-gray-400">{TYPE_LABEL[s.type]}</span>
              </button>
            );
          })}
          {loading && (
            <p className="border-t border-gray-50 px-3 py-2 text-xs text-gray-400">Recherche des villes…</p>
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2">
        {value.map((loc) => {
          const Icon = TYPE_ICON[loc.type];
          return (
            <span
              key={loc.key}
              className="flex items-center gap-1.5 rounded-full border border-[#6366F1] bg-[#EEF2FF] px-3 py-1 text-xs font-medium text-[#3730A3]"
            >
              <Icon className="h-3 w-3" />
              {loc.name}
              <button
                type="button"
                onClick={() => removeLocation(loc.key)}
                aria-label={`Retirer ${loc.name}`}
                className="ml-0.5 rounded-full p-0.5 hover:bg-[#C7D2FE]"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>
      {platform === "tiktok" && (
        <p className="mt-1.5 text-[11px] text-gray-400">
          Ciblage par pays uniquement sur TikTok — la recherche par ville est réservée à Meta.
        </p>
      )}
    </div>
  );
}
