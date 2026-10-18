import { describe, expect, it } from "vitest";
import { isAutopilotLive, selectLiveAutopilotCampaigns, type AutopilotLiveStatus } from "@/lib/autopilot-eligibility";

const now = Date.now();
const proof = (state: AutopilotLiveStatus["state"], checked_at: string | null = new Date(now).toISOString()): AutopilotLiveStatus => ({ state, checked_at, reason: "test" });

describe("active-only autopilot eligibility", () => {
  it.each(["inactive", "paused", "archived", "deleted", "completed", "draft", "review", "paid", "rejected", "error", null, "unknown"])("hides local status %s", (status) => {
    expect(selectLiveAutopilotCampaigns([{ status, autopilot_live_status: proof("active") } as any], now)).toHaveLength(0);
  });

  it.each([null, "not-a-date", new Date(now - 60_000).toISOString(), new Date(now + 1_000).toISOString()])("hides missing, malformed, expired, or future check time %s", (checkedAt) => {
    expect(isAutopilotLive(proof("active", checkedAt), now)).toBe(false);
  });

  it("accepts only a fresh active proof on a locally active campaign", () => {
    expect(isAutopilotLive(proof("active", new Date(now - 10_000).toISOString()), now)).toBe(true);
    expect(selectLiveAutopilotCampaigns([{ status: "active", autopilot_live_status: proof("active") }], now)).toHaveLength(1);
  });
});
