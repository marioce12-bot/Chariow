export const SUBSCRIPTION_EXPIRED_MODAL_EVENT = "vendeo:subscription-expired:show-modal";
export const OPEN_SUBSCRIPTION_SECTION_EVENT = "vendeo:subscription:open-section";
const SUBSCRIPTION_REQUIRED_CODES = new Set(["PLANS_REQUIRED", "PAID_SUBSCRIPTION_REQUIRED"]);

export const SUBSCRIPTION_GATED_SECTIONS = new Set([
  "Vue d'ensemble",
  "Vendeo AI",
  "Studio",
  "Pub",
  "Performance publicitaire",
  "Comptes publicitaires",
  "Radar marché",
  "Mes boutiques",
  "Rapports",
]);

export function hasSubscriptionRequiredPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const code = (payload as { code?: unknown }).code;
  return typeof code === "string" && SUBSCRIPTION_REQUIRED_CODES.has(code);
}

export function requestSubscriptionActivation(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SUBSCRIPTION_EXPIRED_MODAL_EVENT));
}

export function isVendeoSubscriptionExpired(subscription: { status?: string } | null | undefined): boolean {
  return subscription?.status === "past_due";
}
