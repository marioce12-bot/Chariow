// components/vendeo/wizard/types.ts

import { WORLD_COUNTRIES } from "@/lib/geo/countries";
import { DEFAULT_META_CTA, LEGACY_META_CTA, normalizeMetaCta, type MetaCtaType } from "@/lib/meta/cta";
import { stripVendeoCampaignTracking } from "@/lib/meta/tracking";

export type Platform = "meta" | "tiktok" | "pinterest";
export type Objective = "sales" | "traffic" | "engagement" | "leads";
// Le wizard ne choisit pas les placements : Meta optimise automatiquement la diffusion.
export type Placement = "auto";

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
  pinterestAdAccountId?: string;

  // Étape 2 — Publicité
  adName: string;
  mediaUrl: string;
  // Carrousel (Meta) : images supplémentaires après l'image principale (mediaUrl). Vide = image unique.
  carouselUrls: string[];
  // La campagne enregistrée avait déjà un carrousel : sert à envoyer la liste vide si l'utilisateur le retire.
  carouselSaved: boolean;
  adText: string;
  title: string;
  destinationUrl: string;
  // Bouton d'appel à l'action (Meta uniquement) — éditeur "Configuration de la publicité".
  callToAction: MetaCtaType;
  // Advantage+ (Meta uniquement) : créative = améliorations automatiques du visuel/texte (étape 2) ;
  // audience = Meta peut élargir l'audience au-delà du ciblage choisi (étape 3).
  advantageCreative: boolean;
  advantageAudience: boolean;
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

  // Mode « modification » : id de la campagne existante que le wizard met à
  // jour (PATCH) au lieu d'en créer une nouvelle (POST).
  editingCampaignId?: string | null;
}

/** Campagne existante telle que renvoyée par GET /api/ad-campaigns. */
export interface EditableCampaign {
  id: string;
  product_id: string;
  product_name?: string | null;
  platform: Platform;
  objective?: string | null;
  ad_set_name?: string | null;
  ad_name?: string | null;
  title?: string | null;
  ad_text?: string | null;
  media_url?: string | null;
  carousel_urls?: string[] | null;
  destination_url?: string | null;
  call_to_action?: string | null;
  advantage_creative?: boolean | null;
  advantage_audience?: boolean | null;
  countries?: string[] | null;
  geo_targeting?: { countries?: string[]; regions?: { key: string; name: string }[]; cities?: { key: string; name: string }[] } | null;
  min_age?: number | null;
  max_age?: number | null;
  daily_budget: number | string;
  duration_days: number;
  meta_ad_account_id?: string | null;
  meta_page_id?: string | null;
  tiktok_ad_account_id?: string | null;
  pinterest_ad_account_id?: string | null;
  /** Marqueur d’interface : les lieux copiés d’une source historique ne sont pas des pays/audiences gagnants vérifiés. */
  geographyRecommendationUnavailable?: boolean;
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
  carouselUrls: [],
  carouselSaved: false,
  adText: "",
  title: "",
  destinationUrl: "",
  callToAction: DEFAULT_META_CTA,
  advantageCreative: true,
  advantageAudience: false, // désactivé : on garde exactement l'âge et les lieux choisis
  locations: [DEFAULT_LOCATION],
  countries: ["BJ"],
  minAge: 18,
  maxAge: 45,
  dailyBudget: 5, // en $ (minimum 1) : l'ancienne valeur 2000 datait du budget en F CFA
  durationDays: 5,
  campaignId: null,
};

/** Select a catalog product without carrying a previous product's destination link forward. */
export function wizardStateForProductSelection(state: WizardState, product: ChariowProductLite): WizardState {
  return {
    ...state,
    product,
    destinationUrl: state.product?.id === product.id ? state.destinationUrl : product.url ?? "",
  };
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

/** Reconstruit les lieux ciblés d'une campagne existante (régions/villes si
 *  enregistrées, sinon les pays). */
export function locationsFromCampaign(campaign: EditableCampaign): GeoLocation[] {
  const geo = campaign.geo_targeting;
  const countryCodes = (geo?.countries?.length ? geo.countries : campaign.countries?.length ? campaign.countries : ["BJ"]).map((code) => code.toUpperCase());
  const fallbackCountry = countryCodes[0] ?? "BJ";
  const locations: GeoLocation[] = [
    ...(geo?.regions ?? []).map((r) => ({ key: r.key, name: r.name, type: "region" as const, countryCode: fallbackCountry })),
    ...(geo?.cities ?? []).map((c) => ({ key: c.key, name: c.name, type: "city" as const, countryCode: fallbackCountry })),
  ];
  if (!locations.length) {
    return countryCodes.map((code) => ({ key: code, name: COUNTRY_OPTIONS.find((c) => c.code === code)?.label ?? code, type: "country" as const, countryCode: code }));
  }
  return locations;
}

/** État initial du wizard pré-rempli avec une campagne existante. */
export function wizardStateFromCampaign(campaign: EditableCampaign, storeId: string): WizardState {
  const locations = locationsFromCampaign(campaign);
  return {
    ...DEFAULT_WIZARD_STATE,
    storeId,
    product: { id: campaign.product_id, name: campaign.product_name ?? "", description: null, price: null, currency: null, image: null },
    platform: campaign.platform,
    objective: (campaign.objective as Objective) ?? "sales",
    adSetName: campaign.ad_set_name ?? "",
    adName: campaign.ad_name ?? "",
    mediaUrl: campaign.media_url ?? "",
    carouselUrls: Array.isArray(campaign.carousel_urls) ? campaign.carousel_urls.filter((url): url is string => typeof url === "string") : [],
    carouselSaved: Array.isArray(campaign.carousel_urls) && campaign.carousel_urls.length > 0,
    adText: campaign.ad_text ?? "",
    title: campaign.title ?? "",
    destinationUrl: campaign.destination_url ?? "",
    // Campagne créée avant ce réglage (colonne vide) : elle partait avec LEARN_MORE, on le garde.
    callToAction: normalizeMetaCta(campaign.call_to_action) ?? LEGACY_META_CTA,
    advantageCreative: campaign.advantage_creative ?? DEFAULT_WIZARD_STATE.advantageCreative,
    advantageAudience: campaign.advantage_audience ?? DEFAULT_WIZARD_STATE.advantageAudience,
    metaAdAccountId: campaign.meta_ad_account_id ?? undefined,
    tiktokAdAccountId: campaign.tiktok_ad_account_id ?? undefined,
    pinterestAdAccountId: campaign.pinterest_ad_account_id ?? undefined,
    metaPageId: campaign.meta_page_id ?? undefined,
    locations,
    countries: deriveCountries(locations),
    minAge: campaign.min_age ?? DEFAULT_WIZARD_STATE.minAge,
    maxAge: campaign.max_age ?? DEFAULT_WIZARD_STATE.maxAge,
    dailyBudget: Number(campaign.daily_budget) || DEFAULT_WIZARD_STATE.dailyBudget,
    durationDays: campaign.duration_days || DEFAULT_WIZARD_STATE.durationDays,
    campaignId: campaign.id,
    editingCampaignId: campaign.id,
  };
}

/** État initial du wizard pour DUPLIQUER une campagne : mêmes valeurs que l'original (produit,
 *  visuel, texte, audience, budget, bouton, réglages Advantage+…), mais aucun lien avec lui —
 *  sans `campaignId` ni `editingCampaignId`, l'étape 4 crée un nouveau brouillon (POST) et
 *  l'original n'est jamais modifié ni supprimé. Le `utm_campaign` de l'original est retiré du
 *  lien de destination pour que les ventes de la copie ne lui soient pas attribuées. */
export function wizardStateForDuplicate(campaign: EditableCampaign, storeId: string): WizardState {
  const copy = wizardStateFromCampaign(campaign, storeId);
  return {
    ...copy,
    destinationUrl: stripVendeoCampaignTracking(copy.destinationUrl, campaign.id),
    campaignId: null,
    editingCampaignId: null,
  };
}
