import { describe, expect, it } from "vitest";
import { wizardCopy } from "./wizard-copy";

describe("wizardCopy", () => {
  it("provides French and English copy for core wizard steps and controls", () => {
    for (const key of ["wizardExtra.close", "wizardExtra.launch", "wizardExtra.step.product", "wizardExtra.product.continue", "wizardExtra.location.search"]) {
      expect(wizardCopy.fr[key]).toBeTruthy();
      expect(wizardCopy.en[key]).toBeTruthy();
      expect(wizardCopy.fr[key]).not.toBe(wizardCopy.en[key]);
    }
  });

  it("localizes accessible location removal labels with the selected location name", () => {
    expect(wizardCopy.fr["wizardExtra.location.remove"].replace("{name}", "Dakar")).toBe("Retirer Dakar");
    expect(wizardCopy.en["wizardExtra.location.remove"].replace("{name}", "Dakar")).toBe("Remove Dakar");
  });
});
