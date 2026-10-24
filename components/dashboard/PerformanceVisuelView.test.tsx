import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PerformanceVisuelView } from "./PerformanceVisuelView";

describe("PerformanceVisuelView", () => {
  it("shows an honest empty state without invented metrics when no store is selected", () => {
    const html = renderToStaticMarkup(<PerformanceVisuelView storeId={null} onOpenStudio={vi.fn()} />);

    expect(html).toContain("Performance visuel");
    expect(html).toContain("Compare les résultats des images et vidéos de tes campagnes publicitaires.");
    expect(html).toContain("Choisis une boutique connectée pour consulter ses performances.");
    expect(html).toContain("Dépenses publicitaires");
    expect(html).toContain("Chiffre d’affaires attribué");
    expect(html).not.toContain("SHA-256");
    expect(html).not.toContain("Une fiche média, plusieurs campagnes");
    expect(html).not.toContain("55 900");
    expect(html).not.toContain("2 870");
    expect(html).not.toContain("354 000");
  });
});
