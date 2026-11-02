export const SUBSCRIPTION_EXPIRED_MODAL_EVENT = "vendeo:subscription-expired:show-modal";
export const OPEN_SUBSCRIPTION_SECTION_EVENT = "vendeo:subscription:open-section";

export const SUBSCRIPTION_GATED_SECTIONS = new Set([
  "Vendeo AI",
  "Studio",
  "Pub",
  "Performance publicitaire",
]);

export function isVendeoSubscriptionExpired(subscription: { status?: string } | null | undefined): boolean {
  return subscription?.status === "past_due";
}
