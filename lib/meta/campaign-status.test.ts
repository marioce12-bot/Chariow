import { describe, expect, it } from "vitest";
import { mapMetaEffectiveStatus } from "./campaigns";
import { getMetaPausedReason, isMetaPausedReason, markMetaPausedReason } from "./status";

describe("Meta campaign status mapping", () => {
  it("keeps an active campaign active when the account is active", () => {
    expect(mapMetaEffectiveStatus("ACTIVE", null, 1)).toEqual({ status: "active", error: null });
  });

  it("marks an active ad as paused when the account is in a blocking state", () => {
    const result = mapMetaEffectiveStatus("ACTIVE", null, 3);
    expect(result?.status).toBe("paused");
    expect(result?.error).toContain("solde impayé");
  });

  it("does not infer a delivery block from pending settlement or grace period alone", () => {
    expect(mapMetaEffectiveStatus("ACTIVE", null, 8)?.status).toBe("active");
    expect(mapMetaEffectiveStatus("ACTIVE", null, 9)?.status).toBe("active");
    expect(mapMetaEffectiveStatus("ACTIVE", null, 201)?.status).toBe("active");
    expect(mapMetaEffectiveStatus("ACTIVE", null, 202)?.status).toBe("paused");
  });

  it("preserves a concrete Meta pause and includes the account context", () => {
    const result = mapMetaEffectiveStatus("PAUSED", null, 9);
    expect(result?.status).toBe("paused");
    expect(result?.error).toContain("en pause");
    expect(result?.error).toContain("période de grâce");
  });

  it("returns review and rejection states separately", () => {
    expect(mapMetaEffectiveStatus("PENDING_REVIEW", null)?.status).toBe("review");
    expect(mapMetaEffectiveStatus("DISAPPROVED", { reason: "policy" })?.status).toBe("rejected");
  });
});

describe("Meta pause marker", () => {
  it("round-trips a user-facing pause reason without losing other errors", () => {
    const marked = markMetaPausedReason("Meta a mis la publicité en pause.");
    expect(isMetaPausedReason(marked)).toBe(true);
    expect(getMetaPausedReason(marked)).toBe("Meta a mis la publicité en pause.");
    expect(isMetaPausedReason("Meta API error")).toBe(false);
    expect(getMetaPausedReason("Meta API error")).toBeNull();
  });
});
