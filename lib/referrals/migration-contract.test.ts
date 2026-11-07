import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261107100000_referral_program.sql"),
  "utf8",
);

describe("referral SQL migration contract", () => {
  it("enforces one referral per new account and rejects self-referrals", () => {
    expect(migration).toMatch(/referred_user_id uuid not null unique references public\.profiles\(id\)/);
    expect(migration).toMatch(/referrals_no_self_referral check \(referrer_user_id <> referred_user_id\)/);
    expect(migration).toMatch(/if referrer_id is null or referrer_id = new\.id then return new; end if;/);
    expect(migration).toMatch(/lower\(btrim\(coalesce\(email, ''\)\)\) = lower\(btrim\(coalesce\(new\.email, ''\)\)\)/);
    expect(migration).toMatch(/on conflict \(referred_user_id\) do nothing/);
  });

  it("grants one 150-credit ledger entry only to the referrer", () => {
    expect(migration).toMatch(/set balance = balance \+ 150/);
    expect(migration).toMatch(/referrer_id, 'purchase', 150/);
    expect(migration).toMatch(/'referral_signup_bonus', 'referral_signup_' \|\| new_referral_id::text/);
    expect(migration).toMatch(/user_id, kind, credits, balance_before, balance_after, operation/);
    expect(migration).toMatch(/'referred_user_id', new\.id/);
  });

  it("creates a separate free subscription reward at each 25 and 50 referral milestone", () => {
    expect(migration).toMatch(/milestone_count integer not null check \(milestone_count > 0 and mod\(milestone_count, 25\) = 0\)/);
    expect(migration).toMatch(/if referral_total > 0 and mod\(referral_total, 25\) = 0 then/);
    expect(migration).toMatch(/unique \(referrer_user_id, milestone_count\)/);
    expect(migration).toMatch(/on conflict \(referrer_user_id, milestone_count\) do nothing/);
  });

  it("locks and consumes only the requested reward once, then grants a non-renewing 30-day period", () => {
    expect(migration).toMatch(/and referrer_user_id = target_user_id\s+for update/);
    expect(migration).toMatch(/if reward_row\.activated_at is not null then/);
    expect(migration).toMatch(/'duplicate', true/);
    expect(migration).toMatch(/reward_end := base_end \+ 30/);
    expect(migration).toMatch(/status = 'active',\s+trial_active = false/);
    expect(migration).toMatch(/set activated_at = now\(\),\s+starts_on = reward_start,\s+ends_on = reward_end/);
    expect(migration).toMatch(/grant execute on function public\.activate_referral_subscription_reward\(uuid, uuid\) to service_role/);
    expect(migration).not.toMatch(/insert into public\.payment_events/);
  });
});
