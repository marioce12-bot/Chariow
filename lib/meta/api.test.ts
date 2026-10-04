import { describe, expect, it } from "vitest";
import { actionValue } from "./api";

describe("actionValue", () => {
  it("retient uniquement le premier type d'achat prioritaire présent", () => {
    const actions = [
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "8" },
      { action_type: "purchase", value: "10" },
      { action_type: "omni_purchase", value: "12" },
    ];
    expect(actionValue(actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"])).toBe(10);
  });

  it("utilise le type de repli non nul sans additionner les valeurs", () => {
    const actions = [
      { action_type: "purchase", value: "0" },
      { action_type: "omni_purchase", value: "3" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "5" },
    ];
    expect(actionValue(actions, ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"])).toBe(3);
  });
});
