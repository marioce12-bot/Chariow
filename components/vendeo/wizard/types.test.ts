import { describe, expect, it } from "vitest";
import { buildGeoTargeting, deriveCountries, locationsFromCampaign, type EditableCampaign, type GeoLocation } from "./types";

const africa: GeoLocation = { key: "africa", name: "Afrique", type: "country_group", countryCodes: [] };

describe("Meta geographic country groups", () => {
  it("keeps the official group key separate from the country-code list", () => {
    expect(deriveCountries([africa])).toEqual([]);
    expect(buildGeoTargeting([africa])).toEqual({
      countries: [],
      country_groups: ["africa"],
      regions: [],
      cities: [],
    });
  });

  it("restores Africa when a saved campaign is edited", () => {
    const campaign = {
      id: "campaign-1",
      product_id: null,
      platform: "meta",
      countries: [],
      geo_targeting: { countries: [], country_groups: ["africa"] },
      daily_budget: 5,
      duration_days: 5,
    } satisfies EditableCampaign;

    expect(locationsFromCampaign(campaign)).toEqual([
      { key: "africa", name: "Afrique", type: "country_group" },
    ]);
  });
});
