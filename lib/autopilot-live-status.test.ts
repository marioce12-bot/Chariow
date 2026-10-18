import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/crypto", () => ({ decryptSecret: vi.fn(() => "token") }));
import {
  checkAutopilotCampaigns,
  checkAutopilotLiveStatus,
  classifyCampaignLocalStatus,
  classifyMetaLiveStatus,
  classifyTikTokLiveStatus,
} from "./autopilot-live-status";

describe("platform live status classification (fail closed)", () => {
  it.each([
    ["ACTIVE", "active"], ["PAUSED", "inactive"], ["ARCHIVED", "inactive"],
    ["DELETED", "inactive"], ["COMPLETED", "inactive"], ["DRAFT", "unknown"],
    [undefined, "unknown"], ["UNRECOGNIZED", "unknown"],
  ] as const)("Meta effective_status %s -> %s", (effective_status, expected) => {
    expect(classifyMetaLiveStatus(effective_status ? { effective_status } : {})).toBe(expected);
  });
  it("honors positive Meta lifecycle status without overriding a negative effective status", () => {
    expect(classifyMetaLiveStatus({ status: "ACTIVE" })).toBe("unknown");
    expect(classifyMetaLiveStatus({ effective_status: "ACTIVE", status: "DRAFT" })).toBe("active");
    expect(classifyMetaLiveStatus({ effective_status: "FUTURE", status: "ACTIVE" })).toBe("unknown");
    expect(classifyMetaLiveStatus({ status: "ACTIVE", effective_status: "PAUSED" })).toBe("inactive");
    expect(classifyMetaLiveStatus(null)).toBe("unknown");
  });
  it.each([
    ["ENABLE", "CAMPAIGN_DELIVERY_OK", "active"], ["ENABLE", "AD_DELIVERY_OK", "active"], ["ENABLE", "CREATIVE_DELIVERY_OK", "active"], ["ENABLE", "LIVE", "unknown"], ["DISABLE", "CAMPAIGN_DELIVERY_OK", "inactive"],
    ["DELETE", "LIVE", "inactive"], ["ENABLE", "PAUSED", "inactive"],
    ["ENABLE", "ARCHIVED", "inactive"], ["ENABLE", "DELETED", "inactive"],
    ["ENABLE", "COMPLETED", "inactive"], ["ENABLE", "DRAFT", "unknown"],
    ["ENABLE", undefined, "unknown"], [undefined, "LIVE", "unknown"],
    ["ENABLE", "FUTURE_STATUS", "unknown"],
  ] as const)("TikTok operation=%s secondary=%s -> %s", (operation_status, secondary_status, expected) => {
    expect(classifyTikTokLiveStatus({ operation_status, secondary_status })).toBe(expected);
  });
  it.each([
    ["active", "active"], ["ACTIVE", "unknown"], [" active ", "unknown"], ["paused", "inactive"], ["autopilot_paused", "inactive"],
    ["archived", "inactive"], ["deleted", "inactive"], ["completed", "inactive"],
    ["draft", "inactive"], ["review", "inactive"], [null, "unknown"], ["mystery", "unknown"],
  ] as const)("local status %s -> %s", (status, expected) => {
    expect(classifyCampaignLocalStatus(status)).toBe(expected);
  });

});

describe("checkAutopilotLiveStatus", () => {
  it("does not allow a non-active or missing local status to reach active", async () => {
    const supabase = { from: vi.fn(() => { throw new Error("must not query platform credentials"); }) };
    expect((await checkAutopilotLiveStatus(supabase, "u", { status: "paused", platform: "meta" })).state).toBe("inactive");
    expect((await checkAutopilotLiveStatus(supabase, "u", { platform: "meta" })).state).toBe("unknown");
    expect((await checkAutopilotLiveStatus(supabase, "u", { status: "active", platform: "pinterest" })).state).toBe("unknown");
    expect(supabase.from).not.toHaveBeenCalled();
  });
  it("returns campaigns preserving local status and caps work at five concurrent checks", async () => {
    let inFlight = 0;
    let peak = 0;
    const supabase = { from: () => {
      const chain: any = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        inFlight--;
        return { data: null, error: null };
      };
      return chain;
    } };
    const campaigns = Array.from({ length: 12 }, (_, id) => ({ id, platform: "meta", status: "active", external_campaign_id: "c", external_adset_id: "s", external_ad_id: "a", meta_ad_account_id: "acct" }));
    const checked = await checkAutopilotCampaigns(supabase, "u", campaigns);
    expect(peak).toBeLessThanOrEqual(5);
    expect(checked).toHaveLength(12);
    expect(checked[0].status).toBe("active");
    expect(checked.every((row) => row.autopilot_live_status.state === "unknown")).toBe(true);
  });
  it("treats Meta external lifecycle markers and Supabase read rejection safely", async () => {
    const campaign = { status: "active", platform: "meta", external_campaign_id: "c", external_adset_id: "s", external_ad_id: "a", meta_ad_account_id: "account", external_error: "META_ARCHIVED: gone" };
    const db = { from: vi.fn(() => { throw new Error("read failed"); }) };
    expect((await checkAutopilotLiveStatus(db, "u", campaign)).state).toBe("inactive");
    expect((await checkAutopilotLiveStatus(db, "u", { ...campaign, external_error: null })).state).toBe("unknown");
  });
  it("sends provider-shaped TikTok filtering and checks response IDs and adgroup schedule", async () => {
    const calls: URL[] = [];
    const responses = [
      { data: { campaign_id: "c", operation_status: "ENABLE", secondary_status: "campaign_delivery_ok" } },
      { data: { adgroup_id: "s", operation_status: "ENABLE", secondary_status: "ad_delivery_ok", schedule_start_time: "2026-01-01 00:00:00", schedule_end_time: "2026-01-02 00:00:00" } },
      { data: { ad_id: "a", operation_status: "ENABLE", secondary_status: "creative_delivery_ok" } },
    ];
    const chain: any = { select: () => chain, eq: () => chain, maybeSingle: vi.fn() };
    chain.maybeSingle.mockResolvedValueOnce({ data: { tiktok_advertiser_id: "adv", tiktok_integration_id: "i", is_active: true } }).mockResolvedValueOnce({ data: { access_token_encrypted: "token", is_active: true } });
    const db = { from: vi.fn(() => chain) };
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => { calls.push(new URL(url)); return { ok: true, json: async () => responses.shift() }; }));
    const { decryptSecret } = await import("@/lib/crypto");
    vi.mocked(decryptSecret).mockReturnValue("token");
    const status = await checkAutopilotLiveStatus(db, "u", { status: "active", platform: "tiktok", tiktok_ad_account_id: "ta", external_campaign_id: "c", external_adset_id: "s", external_ad_id: "a" });
    expect(calls).toHaveLength(3);
    expect(calls.map(url => url.searchParams.get("filtering"))).toEqual(['{"campaign_ids":["c"]}', '{"adgroup_ids":["s"]}', '{"ad_ids":["a"]}']);
    expect(calls.every(url => !url.searchParams.has("campaign_ids") && !url.searchParams.has("adgroup_ids") && !url.searchParams.has("ad_ids"))).toBe(true);
    expect(status.state).toBe("inactive");
    vi.unstubAllGlobals();
  });
});
