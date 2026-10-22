export const CONFIRMED_SHOPIFY_SALE_STATUSES = ["paid", "partially_refunded"] as const;
/** Refunded/cancelled/test orders are intentionally excluded from confirmed sales. */
export function isConfirmedShopifySaleStatus(status: unknown): boolean { return typeof status === "string" && (CONFIRMED_SHOPIFY_SALE_STATUSES as readonly string[]).includes(status.trim().toLowerCase()); }
export { shopifySaleRows } from "./analytics";
