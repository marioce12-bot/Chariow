import { describe, expect, it } from "vitest";
import {
  canActivateReward,
  FREE_MONTH_DAYS,
  isEligibleReferral,
  isGiftPeriodActive,
  normalizeReferralCode,
  referralMilestones,
  referralProgress,
  REFERRAL_CREDITS_PER_SIGNUP,
  REFERRALS_PER_FREE_MONTH,
} from "./rules";

describe("referral program rules", () => {
  it("normalizes valid link codes and rejects malformed values", () => {
    expect(normalizeReferralCode("  a1b2c3d4e5f607182930abcd ")).toBe("A1B2C3D4E5F607182930ABCD");
    expect(normalizeReferralCode("short-code")).toBeNull();
    expect(normalizeReferralCode(null)).toBeNull();
  });

  it("allows only a new, non-self, not-yet-attributed referral", () => {
    expect(isEligibleReferral({ referrerId: "owner-1", referredUserId: "new-1" })).toBe(true);
    expect(isEligibleReferral({ referrerId: null, referredUserId: "new-1" })).toBe(false);
    expect(isEligibleReferral({ referrerId: "new-1", referredUserId: "new-1" })).toBe(false);
    expect(isEligibleReferral({ referrerId: "owner-1", referredUserId: "new-1", alreadyAttributed: true })).toBe(false);
  });

  it("awards exactly 150 credits per successful referral", () => {
    expect(REFERRAL_CREDITS_PER_SIGNUP).toBe(150);
  });

  it("unlocks one free month at each 25-referral threshold, including 50+", () => {
    expect(REFERRALS_PER_FREE_MONTH).toBe(25);
    expect(referralMilestones(24)).toBe(0);
    expect(referralMilestones(25)).toBe(1);
    expect(referralMilestones(49)).toBe(1);
    expect(referralMilestones(50)).toBe(2);
    expect(referralMilestones(51)).toBe(2);
    expect(referralProgress(50)).toEqual({ completed: 2, towardNext: 0, percent: 0 });
    expect(referralProgress(62)).toEqual({ completed: 2, towardNext: 12, percent: 48 });
  });

  it("makes activation idempotent for the same one-time reward", () => {
    expect(canActivateReward({ id: "reward-25", activatedAt: null }, "reward-25")).toBe(true);
    expect(canActivateReward({ id: "reward-25", activatedAt: "2026-11-07T10:00:00Z" }, "reward-25")).toBe(false);
    expect(canActivateReward({ id: "reward-25", activatedAt: null }, "reward-50")).toBe(false);
  });

  it("treats the end date as active and the following day as expired", () => {
    expect(FREE_MONTH_DAYS).toBe(30);
    expect(isGiftPeriodActive("2026-12-07", "2026-12-07")).toBe(true);
    expect(isGiftPeriodActive("2026-12-07", "2026-12-08")).toBe(false);
    expect(isGiftPeriodActive(null, "2026-12-08")).toBe(false);
  });
});
