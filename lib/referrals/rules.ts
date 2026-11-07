export const REFERRAL_CREDITS_PER_SIGNUP = 150;
export const REFERRALS_PER_FREE_MONTH = 25;
export const FREE_MONTH_DAYS = 30;

const REFERRAL_CODE_PATTERN = /^[A-F0-9]{24}$/;

export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return REFERRAL_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function isEligibleReferral(input: {
  referrerId: string | null | undefined;
  referredUserId: string;
  alreadyAttributed?: boolean;
}): boolean {
  return Boolean(input.referrerId)
    && input.referrerId !== input.referredUserId
    && input.alreadyAttributed !== true;
}

export function referralMilestones(totalReferrals: number): number {
  if (!Number.isFinite(totalReferrals) || totalReferrals <= 0) return 0;
  return Math.floor(totalReferrals / REFERRALS_PER_FREE_MONTH);
}

export function referralProgress(totalReferrals: number): { completed: number; towardNext: number; percent: number } {
  const safeTotal = Math.max(0, Math.floor(Number.isFinite(totalReferrals) ? totalReferrals : 0));
  const towardNext = safeTotal % REFERRALS_PER_FREE_MONTH;
  return {
    completed: referralMilestones(safeTotal),
    towardNext,
    percent: Math.round((towardNext / REFERRALS_PER_FREE_MONTH) * 100),
  };
}

export function canActivateReward(reward: { id: string; activatedAt: string | null }, requestedRewardId: string): boolean {
  return reward.id === requestedRewardId && reward.activatedAt === null;
}

/** Inclusive date comparison matches subscriptions.current_period_end semantics. */
export function isGiftPeriodActive(endDate: string | null | undefined, today: string): boolean {
  return Boolean(endDate) && endDate! >= today;
}
