import { describe, expect, it } from "vitest";
import { buildPackMetaState, isTerminalPackMetaState, unavailablePackMetaState, withPackMetaState } from "./ad-variant-pack-lifecycle";
import type { PackMetaSnapshot } from "./ad-variant-pack-lifecycle";

const baseSnapshot = (): PackMetaSnapshot => ({
  campaign: { id: "campaign-1", status: "ACTIVE", effective_status: "ACTIVE" },
  adsets: [{ id: "set-1", campaign_id: "campaign-1", status: "ACTIVE", effective_status: "ACTIVE" }],
  ads: [
    { id: "ad-1", adset_id: "set-1", campaign_id: "campaign-1", status: "ACTIVE", effective_status: "ACTIVE" },
    { id: "ad-2", adset_id: "set-1", campaign_id: "campaign-1", status: "ACTIVE", effective_status: "PENDING_REVIEW" },
    { id: "ad-3", adset_id: "set-1", campaign_id: "campaign-1", status: "PAUSED", effective_status: "PAUSED" },
  ],
});

describe("Pack Meta lifecycle state", () => {
  it("distinguishes the parent status from each ad’s active, review, or paused state", () => {
    const result = buildPackMetaState(baseSnapshot(), "2026-11-14T08:00:00.000Z");
    expect(result).toMatchObject({
      status: "active",
      synced_at: "2026-11-14T08:00:00.000Z",
      source: "meta",
      ads: [{ status: "active" }, { status: "review" }, { status: "paused" }],
    });
  });

  it("reports review when no ad is active but Meta is still examining an ad", () => {
    const snapshot = baseSnapshot();
    snapshot.ads[0] = { ...snapshot.ads[0], status: "ACTIVE", effective_status: "PENDING_REVIEW" };
    snapshot.ads[2] = { ...snapshot.ads[2], status: "ACTIVE", effective_status: "PENDING_REVIEW" };
    expect(buildPackMetaState(snapshot).status).toBe("review");
  });

  it("marks a Pack deleted when Meta says its campaign was deleted", () => {
    const snapshot = baseSnapshot();
    snapshot.campaign = { ...snapshot.campaign, status: "DELETED", effective_status: "DELETED" };
    expect(buildPackMetaState(snapshot).status).toBe("deleted");
  });

  it("retains other checkpoints while replacing the status and treats unknown as nonterminal", () => {
    const state = unavailablePackMetaState("2026-11-14T08:00:00.000Z", "temporary read failure");
    const merged = withPackMetaState({ activated: true, ads: ["ad-1", "ad-2", "ad-3"] }, state);
    expect(merged).toMatchObject({ activated: true, ads: ["ad-1", "ad-2", "ad-3"], meta_state: { status: "unknown" } });
    expect(isTerminalPackMetaState(state)).toBe(false);
    expect(isTerminalPackMetaState({ status: "deleted" })).toBe(true);
    expect(isTerminalPackMetaState({ status: "archived" })).toBe(true);
  });
});
