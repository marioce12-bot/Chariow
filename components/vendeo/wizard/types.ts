// components/vendeo/wizard/types.ts

import { WORLD_COUNTRIES } from "@/lib/geo/countries";

export type Platform = "meta" | "tiktok";
export type Objective = "sales" | "traffic" | "engagement" | "leads";
// "whatsapp_status" n'est valable que pour platform === "meta" : les pubs dans
// le Statut WhatsApp sont un placement de Meta Ads, pas un réseau à part (pas
// de compte à connecter en plus — voir Step2NetworkCreative pour le détail).
export type Placement = "auto" | "whatsapp_status";

export interface ChariowProductLite {
  id: string;
  name: string;
  description: string | null;
  price: number | string | null;
  currency: string | null;
  image: string | null;
  url?: string | null;
}

// Un lieu ciblé par le widget de recherche d'audience (étape 3). "key" est
// soit un code pays ISO 3166-1 alpha-2 (type "country"), soit une clé de lieu
// Meta (type "region"/"city", renvoyée par /api/integrations/meta/geo-search).
export interface GeoLocation {
  key: string;
  name: string;
  type: "country" | "region" | "city";
  countryCode: string;
}

export interface WizardState {
  // Étape 1
  storeId: string | null;
  product: ChariowProductLite | null;

  // Étape 2 — Ensemble de publicités
  platform: Platform;
  objective: Objective; // toujours "sales" : pas de sélecteur, pas d'écran "Campagne" (nom/budget) — voir Step2NetworkCreative
  adSetName: string;
  placement: Placement;
  // Comptes déjà connectés (à fournir par le parent, cf. INTEGRATION_WIZARD.md)
  metaAdAccountId?: string;
  tiktokAdAccountId?: string;

  // Étape 2 — Publicité
  adName: string;
  mediaUrl: string;
  adText: string;
  title: string;
  destinationUrl: string;
  // "Identité" de la publicité (page Meta / identité TikTok)
  metaPageId?: string;
  tiktokIdentityId?: string;
  tiktokIdentityType?: string;

  // Étape 3 — Audience : "locations" porte le détail (pays/région/ville) choisi
  // via le widget de recherche ; "countries" reste la liste dérivée des seuls
  // codes pays (unique/dédupliquée), conservée pour compatibilité avec la
  // colonne `countries text[]` existante et avec TikTok, qui ne cible que par pays.
  locations: GeoLocation[];
  countries: string[];
  minAge: number;
  maxAge: number;

  // Étape 4
  dailyBudget: number; // budget net qui alimente réellement la campagne (en $, converti au taux Meta/TikTok du compte)
  durationDays: number;

  // Rempli après création du brouillon (étape 4 → étape 5)
  campaignId: string | null;
}

const DEFAULT_LOCATION: GeoLocation = { key: "BJ", name: "Bénin", type: "country", countryCode: "BJ" };

export const DEFAULT_WIZARD_STATE: WizardState = {
  storeId: null,
  product: null,
  platform: "meta",
  objective: "sales",
  adSetName: "",
  placement: "auto",
  adName: "",
  mediaUrl: "",
  adText: "",
  title: "",
  destinationUrl: "",
  locations: [DEFAULT_LOCATION],
  countries: ["BJ"],
  minAge: 18,
  maxAge: 45,
  dailyBudget: 2000,
  durationDays: 5,
  campaignId: null,
};

export interface EstimateResult {
  reachMin: number;
  reachMax: number;
  impressionsMin: number;
  impressionsMax: number;
  totalBudget: number; // budget total de la campagne (daily_budget × durationDays) — aucune commission, tout finance la pub
}

/** Liste des pays proposés par le widget de recherche d'audience (voir lib/geo/countries.ts). */
export const COUNTRY_OPTIONS = WORLD_COUNTRIES.map((c) => ({ code: c.code, label: c.label }));

/** Dérive la liste dédupliquée des codes pays à partir des lieux sélectionnés
 *  (une ville/région "appartient" toujours à un pays via countryCode). Ne
 *  renvoie jamais un tableau vide : c'est ce qui alimente `countries`, requis
 *  par Meta/TikTok et par la colonne `countries text[] not null`. */
export function deriveCountries(locations: GeoLocation[]): string[] {
  const codes = Array.from(new Set(locations.map((l) => l.countryCode).filter(Boolean)));
  return codes.length ? codes : ["BJ"];
}

/** Construit le payload de ciblage géographique détaillé (pays/régions/villes)
 *  envoyé à la création du brouillon, pour que Meta puisse cibler des
 *  villes/régions précises au lancement (voir lib/meta/campaigns.ts). TikTok
 *  ignore ce payload et continue de cibler uniquement par pays. */
export function buildGeoTargeting(locations: GeoLocation[]) {
  return {
    countries: deriveCountries(locations),
    regions: locations.filter((l) => l.type === "region").map((l) => ({ key: l.key, name: l.name })),
    cities: locations.filter((l) => l.type === "city").map((l) => ({ key: l.key, name: l.name, radius: 25, distance_unit: "mile" as const })),
  };
}
