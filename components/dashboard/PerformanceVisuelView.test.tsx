import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PerformanceVisuelView } from "./PerformanceVisuelView";

describe("PerformanceVisuelView", () => {
  it("shows an honest empty state without invented metrics when no store is selected", () => {
    const html = renderToStaticMarkup(<PerformanceVisuelView storeId={null} onOpenStudio={vi.fn()} />);

    expect(html).toContain("Performance publicitaire");
    expect(html).toContain("Résultats des campagnes");
    expect(html).toContain("Visuels");
    expect(html).toContain("Chariow");
    expect(html).not.toContain("Pilotage auto");
    expect(html).not.toContain("Créations et résultats par campagne");
    expect(html).not.toContain("Voir aussi les campagnes sans visuel");
    expect(html).toContain("Choisis une boutique connectée pour consulter les performances des campagnes.");
    expect(html).toContain("Dépenses publicitaires");
    expect(html).toContain("Chiffre d’affaires attribué");
    expect(html).not.toContain("SHA-256");
    expect(html).not.toContain("Une fiche média, plusieurs campagnes");
    expect(html).not.toContain("55 900");
    expect(html).not.toContain("2 870");
    expect(html).not.toContain("354 000");
  });
});
