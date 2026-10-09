import { META_GRAPH_BASE_URL } from "./api";
import type { MetaGeoTargeting } from "./campaigns";

export interface MetaDeliveryEstimate {
  /** Taille d'audience potentielle (borne basse / haute) renvoyée par Meta. */
  audienceMin: number | null;
  audienceMax: number | null;
  /** Portée quotidienne estimée par Meta pour ce ciblage. */
  dailyReach: number | null;
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Estimation de diffusion réelle via l'API Marketing de Meta :
 * GET /act_{id}/delivery_estimate (ads_management / ads_read).
 * Remplace l'ancienne formule locale (CPM fixe) : les chiffres affichés dans
 * l'étape « Simuler la campagne » viennent maintenant de Meta, pour le
 * ciblage (pays / régions / villes, âge) réellement choisi dans le wizard.
 */
export async function fetchMetaDeliveryEstimate(input: {
  accountId: string;
  accessToken: string;
  geoTargeting: MetaGeoTargeting;
  minAge: number;
  maxAge: number;
}): Promise<MetaDeliveryEstimate> {
  const geo = input.geoTargeting;
  const geoLocations: Record<string, unknown> = {
    ...(geo.countries.length ? { countries: geo.countries } : {}),
    ...(geo.regions?.length ? { regions: geo.regions.map((r) => ({ key: r.key })) } : {}),
    ...(geo.cities?.length ? { cities: geo.cities.map((c) => ({ key: c.key, radius: c.radius ?? 25, distance_unit: c.distance_unit ?? "mile" })) } : {}),
  };

  const url = new URL(`${META_GRAPH_BASE_URL}/${input.accountId}/delivery_estimate`);
  url.searchParams.set("targeting_spec", JSON.stringify({ geo_locations: geoLocations, age_min: input.minAge, age_max: input.maxAge }));
  url.searchParams.set("optimization_goal", "LINK_CLICKS");
  url.searchParams.set("access_token", input.accessToken);

  const response = await fetch(url.toString(), { cache: "no-store" });
  const json = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = (json.error as { message?: unknown } | undefined)?.message;
    throw new Error(typeof message === "string" ? message : `Meta delivery_estimate failed (${response.status})`);
  }
  const row = Array.isArray(json.data) ? (json.data[0] as Record<string, unknown> | undefined) : undefined;
  if (!row) throw new Error("Meta n'a renvoyé aucune estimation");

  const result: MetaDeliveryEstimate = {
    audienceMin: toNumber(row.estimate_mau_lower_bound),
    audienceMax: toNumber(row.estimate_mau_upper_bound),
    dailyReach: toNumber(row.estimate_dau),
  };
  if (result.audienceMin == null && result.audienceMax == null && result.dailyReach == null) {
    throw new Error("Meta n'a renvoyé aucune valeur d'estimation exploitable");
  }
  return result;
}
