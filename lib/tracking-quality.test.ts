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
  it("keeps a declared pixel separate from missing campaign attribution", () => {
    const result = assessTrackingQuality({ ...valid, unattributedSales: 2, pixelLastFiredAt: null });
    expect(result.issues.map(i => i.code)).toContain("attribution_missing");
    expect(result.issues.map(i => i.code)).not.toContain("pixel_unknown");
    expect(result.issues.find(i => i.code === "pixel_events_unknown")?.message).toContain("ne remet pas en cause l’installation déclarée");
    expect(result.status).toBe("incomplete");
  });
  it("does not report a missing pixel when store-account association is unavailable", () => {
    const result = assessTrackingQuality({ ...valid, linkedAccounts: 0, pixelConfigured: null, pixelLastFiredAt: null, pixelLookupSkipped: true });
    expect(result.issues.map(i => i.code)).toContain("account_unlinked");
    expect(result.issues.map(i => i.code)).not.toContain("pixel_unknown");
    expect(result.issues.map(i => i.code)).not.toContain("pixel_events_unknown");
    expect(result.status).toBe("incomplete");
    expect(result.automaticActionsAllowed).toBe(false);
  });
});
