import { describe, expect, it } from "vitest";
import { shouldRotateUsageSession } from "@/lib/usage-tracking";

describe("usage session rotation", () => {
  it("starts a new session when none exists", () => {
    expect(shouldRotateUsageSession(null, Date.UTC(2026, 9, 17))).toBe(true);
  });

  it("keeps a recent session within the same UTC day", () => {
    const lastActivityAt = Date.UTC(2026, 9, 17, 12);
    expect(shouldRotateUsageSession({ id: "s", lastActivityAt }, lastActivityAt + 29 * 60_000)).toBe(false);
  });

  it("rotates after 30 minutes without activity", () => {
    const lastActivityAt = Date.UTC(2026, 9, 17, 12);
    expect(shouldRotateUsageSession({ id: "s", lastActivityAt }, lastActivityAt + 30 * 60_000)).toBe(true);
  });

  it("rotates at UTC midnight even when the session is recent", () => {
    const lastActivityAt = Date.UTC(2026, 9, 17, 23, 59);
    expect(shouldRotateUsageSession({ id: "s", lastActivityAt }, lastActivityAt + 2 * 60_000)).toBe(true);
  });
});
