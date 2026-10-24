import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PerformanceVisuelView } from "./PerformanceVisuelView";

describe("PerformanceVisuelView", () => {
  it("shows an honest empty state without invented metrics when no store is selected", () => {
    const html = renderToStaticMarkup(<PerformanceVisuelView storeId={null} onOpenStudio={vi.fn()} />);

    expect(html).toContain("Performance visuel");
    expect(html).toContain("Une fiche média, plusieurs campagnes");
    expect(html).toContain("Choisis une boutique connectée");
    expect(html).toContain("La génération vidéo reste verrouillée");
    expect(html).not.toContain("55 900");
    expect(html).not.toContain("2 870");
    expect(html).not.toContain("354 000");
  });
});
