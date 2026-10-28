import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getMetaGrantedPermissions,
  readMetaPausedTestAdSet,
  readMetaPausedTestCampaign,
} from "./paused-sales-website-test";

afterEach(() => vi.unstubAllGlobals());

function graphResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Meta paused Sales test readback", () => {
  it("ne reconnaît que les permissions explicitement accordées", async () => {
    const fetchMock = vi.fn(async () => graphResponse({ data: [
      { permission: "ads_management", status: "granted" },
      { permission: "ads_read", status: "declined" },
      { permission: "business_management", status: "granted" },
    ] }));
    vi.stubGlobal("fetch", fetchMock);

    const permissions = await getMetaGrantedPermissions("token-for-test");
    expect(permissions).toEqual(new Set(["ads_management", "business_management"]));
    const requestUrl = new URL(String((fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[0]));
    expect(requestUrl.pathname).toContain("/me/permissions");
    expect(requestUrl.searchParams.get("access_token")).toBe("token-for-test");
  });

  it("lit l’objectif et l’état campagne sans accepter un état manquant", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(graphResponse({ id: "campaign-1", objective: "OUTCOME_SALES", status: "PAUSED", effective_status: "PAUSED" }))
      .mockResolvedValueOnce(graphResponse({ id: "campaign-1", objective: "OUTCOME_SALES", status: "PAUSED" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readMetaPausedTestCampaign("campaign-1", "token")).resolves.toMatchObject({
      id: "campaign-1", objective: "OUTCOME_SALES", status: "PAUSED", effectiveStatus: "PAUSED",
    });
    await expect(readMetaPausedTestCampaign("campaign-1", "token")).rejects.toThrow("états status et effective_status");
  });

  it("relit website, offsite conversions, purchase et l’état PAUSED de l’ad set", async () => {
    const fetchMock = vi.fn(async () => graphResponse({
      id: "adset-1",
      status: "PAUSED",
      effective_status: "CAMPAIGN_PAUSED",
      optimization_goal: "OFFSITE_CONVERSIONS",
      destination_type: "WEBSITE",
      promoted_object: { custom_event_type: "PURCHASE" },
      targeting: {
        publisher_platforms: ["instagram", "whatsapp"],
        whatsapp_positions: ["status"],
        instagram_positions: ["story"],
        user_age_unknown: false,
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readMetaPausedTestAdSet("adset-1", "token")).resolves.toEqual({
      id: "adset-1",
      status: "PAUSED",
      effectiveStatus: "CAMPAIGN_PAUSED",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      destinationType: "WEBSITE",
      customEventType: "PURCHASE",
      publisherPlatforms: ["instagram", "whatsapp"],
      whatsappPositions: ["status"],
      instagramPositions: ["story"],
      userAgeUnknown: false,
    });
    const requestUrl = new URL(String((fetchMock.mock.calls[0] as unknown as [URL, RequestInit])[0]));
    expect(requestUrl.searchParams.get("fields")).toContain("targeting");
  });
});
