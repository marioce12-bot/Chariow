import { describe, expect, it } from "vitest";
import { dashboardCopy } from "@/lib/i18n/dashboard-copy";

describe("dashboard-specific copy", () => {
  it("provides distinct English and French dashboard labels", () => {
    expect(dashboardCopy.en["dashboardExtra.productProfit"]).toBe("Estimated profit by product");
    expect(dashboardCopy.fr["dashboardExtra.productProfit"]).toBe("Bénéfice estimé par produit");
    expect(dashboardCopy.en["dashboardExtra.storeLabel"]).toBe("Displayed store");
    expect(dashboardCopy.fr["dashboardExtra.storeLabel"]).toBe("Boutique affichée");
    expect(dashboardCopy.en["dashboardExtra.ariaLoading"]).toBe("Loading your workspace");
    expect(dashboardCopy.fr["dashboardExtra.ariaLoading"]).toBe("Chargement de ton espace");
  });
});
