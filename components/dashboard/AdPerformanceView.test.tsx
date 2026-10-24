import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdPerformanceView } from "./AdPerformanceView";

describe("AdPerformanceView", () => {
  it("renders a skeleton for a connected store before the first read completes", () => {
    const html = renderToStaticMarkup(<AdPerformanceView storeId="store-1" products={[]} onApplyCampaign={() => {}} />);
    expect(html).toContain('class="performance-loading-skeleton performance-skeleton-campaign"');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("Aucune proposition pour le moment");
  });

  it("keeps the campaign entry point concise without exposing campaign or visitor tables", () => {
    const html = renderToStaticMarkup(<AdPerformanceView storeId={null} products={[]} onApplyCampaign={() => {}} />);

    expect(html).toContain("Performance publicitaire");
    expect(html).toContain("Une stratégie claire, proposée à partir des données disponibles.");
    expect(html).not.toContain("Analyse en arrière-plan");
    expect(html).toContain("Connecte une boutique pour préparer une campagne.");
    expect(html).not.toContain("Campagne historique");
    expect(html).not.toContain("Visites");
    expect(html).not.toContain("ROAS");
    expect(html).not.toContain("Performance visuel");
    expect(html).not.toContain("Pilotage auto");
    expect(html).not.toContain("Sérum éclat");
  });

  it("keeps the Preview in an honest empty state without a connected store", () => {
    const previousEnvironment = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "preview";
    try {
      const html = renderToStaticMarkup(<AdPerformanceView storeId={null} products={[]} onApplyCampaign={() => {}} />);
      expect(html).toContain("Connecte une boutique pour préparer une campagne.");
      expect(html).not.toContain("MAQUETTE");
      expect(html).not.toContain("Sérum éclat");
      expect(html).not.toContain("Appliquer");
      expect(html).not.toContain("Lancer maintenant");
    } finally {
      if (previousEnvironment === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = previousEnvironment;
    }
  });
});
