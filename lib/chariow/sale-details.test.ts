import { describe, expect, it } from "vitest";
import { buildSaleContact } from "./sale-details";

describe("buildSaleContact country extraction", () => {
  it("reads a nested country object using its human-readable name", () => {
    expect(buildSaleContact({ customer: { country: { code: "SN", name: "Sénégal" } } }).country).toBe("Sénégal");
  });

  it("reads country ISO codes when no country name is supplied", () => {
    expect(buildSaleContact({ customer: { country: { code: "CI" } } }).country).toBe("CI");
    expect(buildSaleContact({ country_code: "BJ" }).country).toBe("BJ");
  });

  it("extracts country from address or customer payload fields", () => {
    expect(buildSaleContact({ customer: { address: { country: "Ghana" } } }).country).toBe("Ghana");
    expect(buildSaleContact({ customer: { address: { country_code: "NG" } } }).country).toBe("NG");
    expect(buildSaleContact({ customer: { country_name: "Togo" } }).country).toBe("Togo");
  });

  it("reads Chariow checkout context.country without confusing phone dialling country", () => {
    expect(buildSaleContact({
      customer: { phone: { number: "00000000", country: { name: "France", code: "FR" } } },
      context: { country: { name: "Bénin", code: "BJ", alpha_3_code: "BEN" } },
    }).country).toBe("Bénin");
    expect(buildSaleContact({ context: { country: { code: "SN" } } }).country).toBe("SN");
    expect(buildSaleContact({ shipping: { country: { name: "Ghana", code: "GH" } } }).country).toBe("Ghana");
  });

  it("does not infer a country from a phone number and preserves absence", () => {
    expect(buildSaleContact({ customer: { phone: "+1 555 0100" } }).country).toBeNull();
    expect(buildSaleContact({}).country).toBeNull();
  });
});
