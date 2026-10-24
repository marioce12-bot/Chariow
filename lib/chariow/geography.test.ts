import { describe, expect, it } from "vitest";
import { normalizeGeographyAnalytics } from "./geography";
const period = { from: "2026-10-01", to: "2026-10-24" };
describe("Chariow geographic analytics normalization", () => {
  it("keeps traffic separate from sales and conversion data", () => {
    const result = normalizeGeographyAnalytics({
      visits: { data: { locations: [{ country: "BJ", visits: 12 }] } },
      sales: { data: { by_country: [{ country: "SN", sales: 2, revenue: 50, currency: "XOF" }] } },
      conversions: { data: { by_country: [{ country: "TG", visits: 10, conversions: 1, conversion_rate: "0.1" }] } },
    }, period);
    expect(result).toEqual({ period, visitsByLocation: [{ location: "BJ", visits: 12 }], salesByCountry: [{ country: "SN", sales: 2, revenue: 50, currency: "XOF" }], conversionByCountry: [{ country: "TG", visits: 10, sales: 1, rate: 0.1 }] });
  });
  it("uses null for unknown numeric values and unavailable sections, but [] for known empty sections", () => {
    const result = normalizeGeographyAnalytics({ visits: { locations: [] }, sales: { by_country: [{ country: "BJ" }] }, conversions: { unexpected: "opaque" } }, period);
    expect(result.visitsByLocation).toEqual([]);
    expect(result.salesByCountry).toEqual([{ country: "BJ", sales: null, revenue: null, currency: null }]);
    expect(result.conversionByCountry).toBeNull();
  });
  it("does not infer a country from phone or shipping fields", () => {
    const result = normalizeGeographyAnalytics({ visits: { locations: [{ phone: "+229", shipping_country: "BJ", visits: 2 }] }, sales: {}, conversions: {} }, period);
    expect(result.visitsByLocation).toEqual([{ location: "", visits: 2 }]);
    expect(result.salesByCountry).toBeNull();
    expect(result.conversionByCountry).toBeNull();
  });
});
