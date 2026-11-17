import { describe, expect, it } from "vitest";
import { hasSubscriptionRequiredPayload } from "./ui";

describe("subscription-required response detection", () => {
  it("recognizes only explicit subscription requirement codes", () => {
    expect(hasSubscriptionRequiredPayload({ code: "PLANS_REQUIRED" })).toBe(true);
    expect(hasSubscriptionRequiredPayload({ code: "PAID_SUBSCRIPTION_REQUIRED" })).toBe(true);
    expect(hasSubscriptionRequiredPayload({ code: "INSUFFICIENT_CREDITS" })).toBe(false);
    expect(hasSubscriptionRequiredPayload({ code: "INTERNAL_ERROR" })).toBe(false);
    expect(hasSubscriptionRequiredPayload(null)).toBe(false);
  });
});
