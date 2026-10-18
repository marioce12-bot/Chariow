import { describe, expect, it } from "vitest";
import { assessTrackingQuality } from "./tracking-quality";
const valid = { checkedAt: "2026-10-18T00:00:00Z", salesComplete: true, salesSyncedAt: "2026-10-17T23:00:00Z", paidSales: 10, missingProducts: 0, missingAmounts: 0, unattributedSales: 0, linkedAccounts: 1, pixelConfigured: true, pixelLastFiredAt: "2026-10-17T23:00:00Z" };
describe("tracking quality", () => {
  it("does not enable automation even for a clean diagnostic", () => {
    const result = assessTrackingQuality(valid); expect(result.status).toBe("verified"); expect(result.automaticActionsAllowed).toBe(false);
  });
  it("explains unknown coverage, unlinked accounts and missing attribution", () => {
    const result = assessTrackingQuality({ ...valid, salesComplete: null, linkedAccounts: 0, unattributedSales: 3, missingAmounts: 1 });
    expect(result.status).toBe("incomplete"); expect(result.issues.map(i => i.code)).toEqual(expect.arrayContaining(["coverage_unknown", "account_unlinked", "attribution_missing", "amounts_missing"]));
  });
  it("does not confuse query errors or empty sales with verified purchases", () => {
    expect(assessTrackingQuality({ ...valid, salesError: true, paidSales: 0 }).status).toBe("incomplete");
    expect(assessTrackingQuality({ ...valid, salesSyncedAt: null }).issues.some(i => i.code === "sales_stale")).toBe(true);
  });
});
