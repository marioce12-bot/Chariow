import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PerformanceVisuelView } from "./PerformanceVisuelView";

describe("PerformanceVisuelView", () => {
  it("shows a skeleton for a connected store while measured results are loading", () => {
    const html = renderToStaticMarkup(<PerformanceVisuelView storeId="store-1" />);
    expect(html).toContain('class="performance-loading-skeleton performance-skeleton-visuals"');
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("Aucune donnée pour le moment");
  });

  it("is a separate visual comparison screen with an honest empty state", () => {
    const html = renderToStaticMarkup(<PerformanceVisuelView storeId={null} />);

    expect(html).toContain("<h1>Suivi des créations</h1>");
    expect(html).toContain("Pub");
    expect(html).toContain("Analyse des créations");
    expect(html).toContain("Données réelles uniquement");
    expect(html).toContain("Choisis une boutique connectée pour consulter ses créations.");
    expect(html).not.toContain("Performance publicitaire");
    expect(html).not.toContain("Résultats des campagnes");
    expect(html).not.toContain("Visites");
    expect(html).not.toContain("Campagne");
    expect(html).not.toContain("Pilotage auto");
    expect(html).not.toContain("55 900");
    expect(html).not.toContain("2 870");
    expect(html).not.toContain("354 000");
    expect(html).not.toContain("Sérum éclat");
  });
});
