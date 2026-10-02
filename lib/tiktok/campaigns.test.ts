import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTikTokLocationIds } from "./api";
import { createTikTokCampaign } from "./campaigns";

afterEach(() => {
  vi.unstubAllGlobals();
});

function tiktokResponse(data: Record<string, unknown>) {
  return new Response(JSON.stringify({ code: 0, message: "OK", request_id: "test-request", data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("TikTok campaign targeting", () => {
  it("returns only country-level location IDs and reports every unsupported selected country", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tiktokResponse({
      region_list: [
        { country_code: "NG", region_id: "2328926", parent_id: null },
        { country_code: "NG", region_id: "2328927", parent_id: "2328926" },
        { country_code: "GH", region_id: "1234567", parent_id: "1234500" },
      ],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveTikTokLocationIds("advertiser-test", "token-test", ["BJ", "NG"]);

    expect(result).toEqual({
      locationIds: ["2328926"],
      unsupportedCountryCodes: ["BJ"],
    });
  });

  it("does not treat a subregion as support for country-wide targeting", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tiktokResponse({
      region_list: [{ country_code: "NG", region_id: "2328927", parent_id: "2328926" }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveTikTokLocationIds("advertiser-test", "token-test", ["NG"]);

    expect(result).toEqual({ locationIds: [], unsupportedCountryCodes: ["NG"] });
  });

  it("sends TikTok's accepted WEB_CONVERSIONS objective for sales campaigns", async () => {
    const fetchMock = vi.fn().mockResolvedValue(tiktokResponse({ campaign_id: "campaign-test" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createTikTokCampaign({
      advertiserId: "advertiser-test",
      accessToken: "token-test",
      name: "Campaign test",
      objective: "sales",
    });

    expect(result).toEqual({ id: "campaign-test", objective: "WEB_CONVERSIONS" });
    const request = fetchMock.mock.calls[0];
    expect(JSON.parse(String(request[1]?.body))).toMatchObject({ objective_type: "WEB_CONVERSIONS" });
  });
});
