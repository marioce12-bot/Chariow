export interface GeoTargetingInput {
  countries: string[];
  regions: { key: string; name: string }[];
  cities: { key: string; name: string; radius: number; distance_unit: string }[];
}

/** Ne garde que des champs bien formés — un payload malformé (ou absent) est
 *  silencieusement ignoré plutôt que de faire échouer la création du brouillon :
 *  `countries` (déjà validé séparément) reste dans tous les cas la donnée de
 *  secours utilisée par TikTok et par le lancement Meta. */
export function sanitizeGeoTargeting(input: unknown): GeoTargetingInput | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const regions = Array.isArray(raw.regions)
    ? raw.regions.filter((r): r is { key: string; name: string } => !!r && typeof (r as any).key === "string" && typeof (r as any).name === "string")
    : [];
  const cities = Array.isArray(raw.cities)
    ? raw.cities.filter((c): c is { key: string; name: string; radius: number; distance_unit: string } => !!c && typeof (c as any).key === "string" && typeof (c as any).name === "string")
        .map((c) => ({ key: c.key, name: c.name, radius: Number((c as any).radius) > 0 ? Number((c as any).radius) : 25, distance_unit: typeof (c as any).distance_unit === "string" ? (c as any).distance_unit : "mile" }))
    : [];
  const countries = Array.isArray(raw.countries) ? raw.countries.filter((c): c is string => typeof c === "string") : [];
  if (!regions.length && !cities.length && !countries.length) return null;
  return { countries, regions, cities };
}
