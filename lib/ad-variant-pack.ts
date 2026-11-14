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

export type VariantPackStore = { id: string; platform?: string; connection_status?: string | null; is_active?: boolean };

/** Keep the wizard's store picker aligned with sources usable by campaign creation. */
export function getConnectedVariantPackStores<T extends VariantPackStore>(stores: readonly T[]): T[] {
  return stores.filter(isVariantPackStore);
}

/** Empty defaults and auto-selected accounts/stores are not user-created drafts. */
export function hasVariantPackDraftProgress(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  if (draft.started === true) return true;

  const hasItems = (items: unknown) => Array.isArray(items) && items.length > 0;
  const variants = draft.variants && typeof draft.variants === "object" && !Array.isArray(draft.variants)
    ? Object.values(draft.variants as Record<string, { format?: unknown; media?: unknown }>)
    : [];
  const changedLocations = Array.isArray(draft.locations) && (
    draft.locations.length !== 1 ||
    !draft.locations[0] || typeof draft.locations[0] !== "object" ||
    (draft.locations[0] as { key?: unknown }).key !== "BJ"
  );

  return Boolean(
    (typeof draft.productId === "string" && draft.productId.trim()) ||
    (typeof draft.step === "number" && draft.step > 1) ||
    hasItems(draft.angles) || hasItems(draft.selected) ||
    variants.some((variant) => Boolean(variant?.format) || hasItems(variant?.media)) ||
    (typeof draft.objective === "string" && draft.objective !== "sales") ||
    (draft.minAge !== undefined && Number(draft.minAge) !== 18) ||
    (draft.maxAge !== undefined && Number(draft.maxAge) !== 45) ||
    draft.gender != null || hasItems(draft.interests) || draft.advantageAudience === true ||
    (draft.dailyBudget !== undefined && Number(draft.dailyBudget) !== 5) ||
    (draft.durationDays !== undefined && Number(draft.durationDays) !== 5) || changedLocations ||
    Boolean(draft.packId) || hasItems(Object.values((draft.campaignIds ?? {}) as object)) ||
    hasItems(Object.values((draft.launched ?? {}) as object).filter(Boolean))
  );
}

/** Invalid saved step values safely return to the first setup screen. */
export function getVariantPackDraftStep(value: unknown): number {
  const step = typeof value === "number" ? value : Number(value);
  return Number.isInteger(step) && step >= 1 && step <= 4 ? step : 1;
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
