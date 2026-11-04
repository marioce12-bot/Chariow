import { describe, expect, it } from "vitest";
import { hasPaidSubscriptionAccess } from "./access";

const now = new Date("2026-11-04T12:00:00.000Z");

describe("hasPaidSubscriptionAccess", () => {
  it("allows an active paid subscription through its final period date", () => {
    expect(hasPaidSubscriptionAccess({ status: "active", trial_active: false, current_period_end: "2026-11-04" }, now)).toBe(true);
  });

  it("does not treat an active free trial as a paid subscription", () => {
    expect(hasPaidSubscriptionAccess({ status: "trialing", trial_active: true, trial_ends_at: "2026-11-09T12:00:00.000Z", current_period_end: null }, now)).toBe(false);
    expect(hasPaidSubscriptionAccess({ status: "active", trial_active: true, trial_ends_at: "2026-11-09T12:00:00.000Z", current_period_end: "2026-11-30" }, now)).toBe(false);
  });

  it("rejects missing, non-active, and expired paid subscriptions", () => {
    expect(hasPaidSubscriptionAccess(null, now)).toBe(false);
    expect(hasPaidSubscriptionAccess({ status: "past_due", trial_active: false, current_period_end: "2026-11-30" }, now)).toBe(false);
    expect(hasPaidSubscriptionAccess({ status: "active", trial_active: false, current_period_end: "2026-11-03" }, now)).toBe(false);
  });
});
