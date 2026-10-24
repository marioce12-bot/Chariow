import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdPerformanceView } from "./AdPerformanceView";

describe("AdPerformanceView", () => {
  it("explains the campaign action without exposing campaign or visitor tables", () => {
    const html = renderToStaticMarkup(<AdPerformanceView storeId={null} products={[]} onApplyCampaign={() => {}} />);

    expect(html).toContain("Performance publicitaire");
    expect(html).toContain("Une stratégie claire, proposée à partir des données disponibles.");
    expect(html).toContain("Analyse en arrière-plan");
    expect(html).toContain("Connecte une boutique pour préparer une campagne.");
    expect(html).not.toContain("Campagne historique");
    expect(html).not.toContain("Visites");
    expect(html).not.toContain("ROAS");
    expect(html).not.toContain("Performance visuel");
    expect(html).not.toContain("Pilotage auto");
    expect(html).not.toContain("Sérum éclat");
  });

  it("shows the approved advertising example in Preview and labels it as illustrative", () => {
    const previousEnvironment = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "preview";
    try {
      const html = renderToStaticMarkup(<AdPerformanceView storeId={null} products={[]} onApplyCampaign={() => {}} />);
      expect(html).toContain("MAQUETTE — EXEMPLE, NON BASÉ SUR DES DONNÉES RÉELLES");
      expect(html).toContain("Recommandation de campagne");
      expect(html).toContain("Aperçu du visuel (exemple)");
      expect(html).toContain("Lancer maintenant");
      expect(html).toContain("disabled");
    } finally {
      if (previousEnvironment === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previousEnvironment;
    }
  });
});
