import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdPerformanceView } from "./AdPerformanceView";

describe("AdPerformanceView", () => {
  it("explains the campaign action without exposing campaign or visitor tables", () => {
    const html = renderToStaticMarkup(<AdPerformanceView storeId={null} products={[]} onApplyCampaign={() => {}} />);

    expect(html).toContain("Performance publicitaire");
    expect(html).toContain("Choisis un produit pour préparer une campagne");
    expect(html).toContain("Connecte une boutique pour préparer une campagne.");
    expect(html).not.toContain("Campagne historique");
    expect(html).not.toContain("Visites");
    expect(html).not.toContain("ROAS");
    expect(html).not.toContain("Performance visuel");
  });
});
