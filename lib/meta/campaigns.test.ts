import { afterEach, describe, expect, it, vi } from "vitest";
import { createMetaAdSet, isMetaObjectMissingError } from "./campaigns";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isMetaObjectMissingError", () => {
  it("recognizes explicit missing or deleted objects", () => {
    expect(isMetaObjectMissingError("Campaign with ID 123 does not exist")).toBe(true);
    expect(isMetaObjectMissingError("This campaign has been deleted")).toBe(true);
  });

  it("does not treat ambiguous Graph access errors as proof of deletion", () => {
    expect(isMetaObjectMissingError("Unsupported get request: object does not exist, cannot be loaded due to missing permissions, or does not support this operation")).toBe(false);
    expect(isMetaObjectMissingError("Permission denied")).toBe(false);
    expect(isMetaObjectMissingError("Object does not support this operation")).toBe(false);
  });
});

describe("createMetaAdSet country groups", () => {
  it("sends Meta's Africa and Europe groups without falling back to country codes", async () => {
    const responses = [
      new Response(JSON.stringify({ id: "adset-1" }), { status: 200 }),
      new Response(JSON.stringify({ destination_type: "WEBSITE" }), { status: 200 }),
    ];
    const fetchMock = vi.fn(async () => responses.shift()!);
    vi.stubGlobal("fetch", fetchMock);

    await createMetaAdSet({
      accountId: "act_1",
      accessToken: "token",
      campaignId: "campaign-1",
      name: "Audiences Afrique et Europe",
      dailyBudget: 5,
      countries: ["BJ"],
      geoTargeting: { countries: [], country_groups: ["africa", "europe"] },
      minAge: 18,
      maxAge: 45,
      advertiserName: "Boutique test",
    });

    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const params = new URLSearchParams(String(init.body));
    const targeting = JSON.parse(params.get("targeting") ?? "{}");
    expect(targeting.geo_locations).toEqual({ country_groups: ["africa", "europe"] });
  });
});
