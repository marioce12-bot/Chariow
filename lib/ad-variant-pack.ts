export type AdAngle = {
  id: string;
  title: string;
  rationale: string;
  copy: string;
  recommended?: boolean;
};

export type VariantPerformance = {
  id: string;
  impressions: number;
  clicks: number;
  purchases: number;
  spend: number;
};

export type PackRecommendation =
  | { kind: "insufficient_data"; keep: []; pause: [] }
  | { kind: "keep_one"; keep: [string]; pause: string[] }
  | { kind: "keep_two"; keep: [string, string]; pause: string[] };

export const MIN_VARIANT_PURCHASES_FOR_VERDICT = 5;
export type VariantFormat = "image" | "video" | "carousel";

/** Every variant must have a format, but formats are intentionally repeatable. */
export function haveThreeChosenFormats(formats: Array<string | null | undefined>): boolean {
  const valid = new Set<VariantFormat>(["image", "video", "carousel"]);
  return formats.length === 3 && formats.every((format) => valid.has(format as VariantFormat));
}

export function selectRecommendedAngles<T extends { recommended?: boolean }>(angles: T[]): T[] {
  return angles.filter((angle) => angle.recommended).slice(0, 3);
}

/** Product sources supported by the current ad-campaign creation API. */
export function isVariantPackStore(store: { platform?: string; connection_status?: string | null; is_active?: boolean }): boolean {
  return store.is_active !== false && store.connection_status === "connected" && (store.platform === "chariow" || store.platform === "shopify");
}

/**
 * Be deliberately conservative: no performance winner is named until every
 * compared variant has enough delivery and purchase observations.
 */
export function recommendPackAction(results: VariantPerformance[]): PackRecommendation {
  if (results.length < 2 || results.some((row) =>
    !Number.isFinite(row.impressions) || row.impressions < 1000 ||
    !Number.isFinite(row.clicks) || row.clicks < 20 ||
    !Number.isFinite(row.purchases) || row.purchases < MIN_VARIANT_PURCHASES_FOR_VERDICT ||
    !Number.isFinite(row.spend) || row.spend <= 0
  )) return { kind: "insufficient_data", keep: [], pause: [] };

  const ranked = [...results].sort((a, b) =>
    (a.spend / a.purchases) - (b.spend / b.purchases),
  );
  const best = ranked[0];
  const second = ranked[1];
  const bestCost = best.spend / best.purchases;
  const secondCost = second.spend / second.purchases;
  const relativeGap = bestCost > 0 ? (secondCost - bestCost) / bestCost : Infinity;
  if (relativeGap <= 0.1) {
    return { kind: "keep_two", keep: [best.id, second.id], pause: ranked.slice(2).map((row) => row.id) };
  }
  return { kind: "keep_one", keep: [best.id], pause: ranked.slice(1).map((row) => row.id) };
}
