import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration = readFileSync(new URL("../supabase/migrations/20261023133000_signup_100_credits.sql", import.meta.url), "utf8");

describe("100-credit signup bonus", () => {
  it("grants 100 and writes the ledger only when a new account was inserted", () => {
    expect(migration).toContain("values (new.id, 100)");
    expect(migration).toMatch(/on conflict \(user_id\) do nothing;\s+if found then\s+insert into public.credit_transactions/);
    expect(migration).toContain("values (new.id, 'purchase', 100, 0, 100, 'welcome_credits'");
    expect(migration).toMatch(/if exists[\s\S]*operation = 'welcome_credits'[\s\S]*return new/);
  });
  it("never backfills, updates balances, or changes trial/subscription rules", () => {
    const sql = migration.replace(/--[^\n]*/g, "");
    expect(sql).not.toMatch(/\bupdate\b|\bdelete\b|subscriptions|trial_ends_at|handle_new_user\(\)/i);
    expect(sql).toContain("after insert on auth.users");
    expect(sql.match(/create or replace trigger/g)).toHaveLength(1);
  });
  it("updates only the signup offer in both languages", () => {
    const fr = readFileSync(new URL("../lib/i18n/translations/fr.ts", import.meta.url), "utf8");
    const en = readFileSync(new URL("../lib/i18n/translations/en.ts", import.meta.url), "utf8");
    expect(fr).toContain("100 crédits Studio offerts à l'inscription");
    expect(en).toContain("100 Studio credits offered at signup");
    expect(fr).not.toContain("75 crédits Studio offerts à l'inscription");
    expect(en).not.toContain("75 Studio credits offered at signup");
  });
});
