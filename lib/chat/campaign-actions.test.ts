import { afterEach, describe, expect, it } from "vitest";
import { isConfirmationRequired, issueConfirmation, normalizeChanges, verifyConfirmation } from "./campaign-actions";

afterEach(() => { delete process.env.TOKEN_ENCRYPTION_KEY; });
describe("campaign action confirmation helpers", () => {
  it("validates exact title and budget arguments", () => {
    expect(normalizeChanges("edit", { title: " New ", daily_budget: 12 })).toEqual({ title: "New", daily_budget: 12 });
    expect(() => normalizeChanges("pause", { title: "x" })).toThrow();
    expect(() => normalizeChanges("edit", { daily_budget: Infinity })).toThrow();
    expect(() => normalizeChanges("edit", { unsupported: true })).toThrow();
    expect(() => normalizeChanges("edit", undefined)).toThrow();
    expect(() => normalizeChanges("edit", {})).toThrow();
  });
  it("requires explicit UI confirmation for destructive, activation and budget changes", () => {
    expect(isConfirmationRequired("activate", {})).toBe(true);
    expect(isConfirmationRequired("delete", {})).toBe(true);
    expect(isConfirmationRequired("edit", { daily_budget: 10 })).toBe(true);
    expect(isConfirmationRequired("edit", { title: "X" })).toBe(false);
  });
  it("signs confirmation bound to user, target, exact action, args and fresh state", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "test-only-signing-secret";
    const scope = { userId: "u1", campaignId: "c1", action: "pause" as const, changes: {}, status: "ACTIVE", updatedAt: "2026-01-01T00:00:00Z" };
    const token = issueConfirmation(scope);
    expect(verifyConfirmation(token, scope)).toBe(true);
    expect(verifyConfirmation(token, { ...scope, userId: "u2" })).toBe(false);
    expect(verifyConfirmation(token, { ...scope, status: "PAUSED" })).toBe(false);
    expect(verifyConfirmation(token, { ...scope, action: "activate" })).toBe(false);
    expect(verifyConfirmation(`${token}x`, scope)).toBe(false);
    expect(verifyConfirmation(`${token}.ignored`, scope)).toBe(false);
    expect(verifyConfirmation(token, { ...scope, updatedAt: "new-revision" })).toBe(false);
  });
  it("expires tokens", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "test-only-signing-secret";
    const scope = { userId: "u1", campaignId: "c1", action: "pause" as const, changes: {}, status: "ACTIVE", updatedAt: "2026-01-01T00:00:00Z" };
    const token = issueConfirmation(scope);
    const now = Date.now;
    Date.now = () => now() + 6 * 60_000;
    try { expect(verifyConfirmation(token, scope)).toBe(false); } finally { Date.now = now; }
  });
});
