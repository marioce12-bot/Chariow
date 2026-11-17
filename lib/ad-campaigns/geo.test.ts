import { describe, expect, it } from "vitest";
import { sanitizeGeoTargeting } from "./geo";

describe("sanitizeGeoTargeting country groups", () => {
  it("preserves Africa as a valid group even without individual countries", () => {
    expect(sanitizeGeoTargeting({ countries: [], country_groups: ["africa"] })).toEqual({
      countries: [],
      country_groups: ["africa"],
      regions: [],
      cities: [],
    });
  });

  it("rejects unsupported group identifiers instead of sending invalid Meta targets", () => {
    expect(sanitizeGeoTargeting({ countries: [], country_groups: ["africa-not-a-code"] })).toBeNull();
  });
});
