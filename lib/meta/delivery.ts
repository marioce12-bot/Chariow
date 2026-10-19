/** Delivery evidence is separate from Meta's configured/effective ACTIVE switch.
 * A significant edit can return an existing ad to Preparing, so historic
 * impressions alone must not unlock activation after a changed revision.
 */
export type MetaDeliveryObservation = {
  ad_id: string;
  revision: string;
  baseline_impressions: number;
  confirmed: boolean;
};
export type MetaDeliverySnapshot = {
  effectiveStatus: string;
  impressions?: number | null;
  createdTime?: string | null;
  updatedTime?: string | null;
};
export function evaluateMetaDelivery(adId: string, snapshot: MetaDeliverySnapshot, previous: unknown): { state: "active" | "preparing" | "unknown"; observation: MetaDeliveryObservation | null } {
  const { impressions, effectiveStatus } = snapshot;
  const created = Date.parse(snapshot.createdTime ?? "");
  const updated = Date.parse(snapshot.updatedTime ?? "");
  const valid = typeof impressions === "number" && Number.isSafeInteger(impressions) && impressions >= 0 && Number.isFinite(created) && Number.isFinite(updated) && updated >= created && updated <= Date.now();
  if (!valid) return { state: "unknown", observation: null };
  const revision = new Date(updated).toISOString();
  const prior = previous as Partial<MetaDeliveryObservation> | null;
  const sameRevision = prior?.ad_id === adId && prior.revision === revision && typeof prior.baseline_impressions === "number" && Number.isSafeInteger(prior.baseline_impressions) && prior.baseline_impressions >= 0 && prior.baseline_impressions <= impressions;
  const observation: MetaDeliveryObservation = { ad_id: adId, revision, baseline_impressions: sameRevision ? prior!.baseline_impressions! : impressions, confirmed: false };
  if (["PREPARING", "IN_PROCESS", "PENDING_PROCESS", "PREAPPROVED", "PROCESSING", "PENDING_REVIEW"].includes(effectiveStatus)) {
    return { state: "preparing", observation: { ...observation, baseline_impressions: impressions } };
  }
  if (effectiveStatus !== "ACTIVE") return { state: "unknown", observation: null };
  // A brand-new, never-edited ad with an impression has started delivery.
  // For an edited/existing revision, require growth after our revision baseline.
  const confirmed = sameRevision
    ? prior!.confirmed === true || impressions > prior!.baseline_impressions!
    : created === updated && impressions > 0;
  return { state: confirmed ? "active" : "preparing", observation: { ...observation, confirmed } };
}
