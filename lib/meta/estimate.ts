import { META_GRAPH_BASE_URL } from "./api";

export interface MetaDeliveryEstimate {
  audienceMin: number | null;
  audienceMax: number | null;
  dailyReach: number | null;
}

function toNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export async function fetchMetaDeliveryEstimate(input: {
  accountId: string;
  accessToken: string;
  geoTargeting: { countries: string[]; regions?: Array<{ key: string }>; cities?: Array<{ key: string; radius?: number; distance_unit?: string }> };
  minAge: number;
  maxAge: number;
}): Promise<MetaDeliveryEstimate> {
  const geo = input.geoTargeting;
  const geoLocations = {
    ...(geo.countries.length ? { countries: geo.countries } : {}),
    ...(geo.regions?.length ? { regions: geo.regions.map((region) => ({ key: region.key })) } : {}),
    ...(geo.cities?.length ? { cities: geo.cities.map((city) => ({ key: city.key, radius: city.radius ?? 25, distance_unit: city.distance_unit ?? "mile" })) } : {}),
  };
  const url = new URL(`${META_GRAPH_BASE_URL}/${input.accountId}/delivery_estimate`);
  url.searchParams.set("targeting_spec", JSON.stringify({ geo_locations: geoLocations, age_min: input.minAge, age_max: input.maxAge }));
  url.searchParams.set("optimization_goal", "LINK_CLICKS");
  url.searchParams.set("access_token", input.accessToken);

  const response = await fetch(url.toString(), { cache: "no-store" });
  const json = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = json.error as { message?: unknown } | undefined;
    throw new Error(typeof error?.message === "string" ? error.message : `Meta delivery estimate failed (${response.status})`);
  }
  const row = Array.isArray(json.data) ? json.data[0] as Record<string, unknown> | undefined : undefined;
  if (!row) throw new Error("Meta n'a renvoyé aucune estimation");

  const estimate = {
    audienceMin: toNumber(row.estimate_mau_lower_bound),
    audienceMax: toNumber(row.estimate_mau_upper_bound),
    dailyReach: toNumber(row.estimate_dau),
  };
  if (estimate.audienceMin == null && estimate.audienceMax == null && estimate.dailyReach == null) {
    throw new Error("Meta n'a renvoyé aucune valeur d'estimation exploitable");
  }
  return estimate;
}
