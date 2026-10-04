/** Statuts Chariow qui représentent une vente encaissée et non annulée. */
export const CONFIRMED_CHARIOW_SALE_STATUSES = ["completed", "settled"] as const;

export function isConfirmedChariowSaleStatus(status: unknown): boolean {
  return typeof status === "string" && (CONFIRMED_CHARIOW_SALE_STATUSES as readonly string[]).includes(status.trim().toLowerCase());
}
