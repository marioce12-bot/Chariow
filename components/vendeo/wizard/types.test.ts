import { describe, expect, it } from "vitest";
import { buildGeoTargeting, deriveCountries, locationsFromCampaign, type EditableCampaign, type GeoLocation } from "./types";

const africa: GeoLocation = { key: "africa", name: "Afrique", type: "country_group", countryCodes: [] };
const europe: GeoLocation = { key: "europe", name: "Europe", type: "country_group", countryCodes: [] };

describe("Meta geographic country groups", () => {
  it("keeps Africa and Europe as official group keys separate from country codes", () => {
    expect(deriveCountries([africa, europe])).toEqual([]);
    expect(buildGeoTargeting([africa, europe])).toEqual({
      countries: [],
      country_groups: ["africa", "europe"],
      regions: [],
      cities: [],
    });
  });

  it("restores both supported groups when a saved campaign is edited", () => {
    const campaign = {
      id: "campaign-1",
      product_id: null,
      platform: "meta",
      countries: [],
      geo_targeting: { countries: [], country_groups: ["africa", "europe"] },
      daily_budget: 5,
      duration_days: 5,
    } satisfies EditableCampaign;

    expect(locationsFromCampaign(campaign)).toEqual([
      { key: "africa", name: "Afrique", type: "country_group" },
      { key: "europe", name: "Europe", type: "country_group" },
    ]);
  });
});
