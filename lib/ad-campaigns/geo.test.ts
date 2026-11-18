import { describe, expect, it } from "vitest";
import { formatGeoTargetingSummary, sanitizeGeoTargeting } from "./geo";

describe("sanitizeGeoTargeting country groups", () => {
  it("preserves Africa and Europe as valid groups without individual countries", () => {
    expect(sanitizeGeoTargeting({ countries: [], country_groups: ["africa", "europe"] })).toEqual({
      countries: [],
      country_groups: ["africa", "europe"],
      regions: [],
      cities: [],
    });
  });

  it("rejects unsupported group identifiers instead of sending invalid Meta targets", () => {
    expect(sanitizeGeoTargeting({ countries: [], country_groups: ["africa-not-a-code"] })).toBeNull();
  });

  it("formats saved groups in French and English while preserving Africa", () => {
    expect(formatGeoTargetingSummary(["africa", "europe"], [], "fr")).toBe("Afrique, Europe");
    expect(formatGeoTargetingSummary(["africa", "europe"], [], "en")).toBe("Africa, Europe");
  });
});
