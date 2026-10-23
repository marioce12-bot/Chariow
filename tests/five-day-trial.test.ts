import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSubscriptionActive } from "@/lib/shop/subscription";

const migration = readFileSync(new URL("../supabase/migrations/20261023120000_five_day_new_trials.sql", import.meta.url), "utf8");
describe("five-day trial rollout", () => {
  it("sets both future signup and column default to exactly 120 hours", () => {
    expect(migration.match(/interval '120 hours'/g)).toHaveLength(2);
    expect(migration).toContain("on conflict (user_id) do nothing");
  });
  it("never backfills subscriptions or touches welcome credits or paid periods", () => {
    const sql = migration.replace(/--[^\n]*/g, "");
    expect(sql).not.toMatch(/update\s+(?:public\.)?subscriptions/i);
    expect(sql).not.toMatch(/credit_accounts|credit_transactions|handle_new_user_credit_account|current_period_end/i);
  });
  it("honors a legacy 15-day deadline after the fifth day, with no recalculation", () => {
    const legacy = { status: "trialing", trial_active: true, trial_ends_at: "2026-11-16T12:00:00Z", current_period_end: null };
    expect(isSubscriptionActive(legacy, new Date("2026-11-12T12:00:00Z"))).toBe(true);
    expect(isSubscriptionActive(legacy, new Date("2026-11-16T11:59:59Z"))).toBe(true);
    expect(isSubscriptionActive(legacy, new Date("2026-11-16T12:00:00Z"))).toBe(false);
    expect(legacy.trial_ends_at).toBe("2026-11-16T12:00:00Z");
  });
  it("ends a new five-day trial at its persisted deadline exactly", () => {
    const trial = { status: "trialing", trial_active: true, trial_ends_at: "2026-11-06T12:00:00Z", current_period_end: null };
    expect(isSubscriptionActive(trial, new Date("2026-11-06T11:59:59.999Z"))).toBe(true);
    expect(isSubscriptionActive(trial, new Date("2026-11-06T12:00:00Z"))).toBe(false);
  });
});
