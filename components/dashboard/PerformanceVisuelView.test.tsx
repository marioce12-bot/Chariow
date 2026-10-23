import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PerformanceVisuelView } from "./PerformanceVisuelView";

describe("PerformanceVisuelView", () => {
  it("shows no sample metrics and clearly gates creative ideas on analyzed campaign history", () => {
    const html = renderToStaticMarkup(<PerformanceVisuelView />);

    expect(html).toContain("Performance visuel");
    expect(html).toContain("Une fiche par média");
    expect(html).toContain("Aucune donnée fictive");
    expect(html).toContain("campagne effectivement lancée");
    expect(html).toContain("historique analysé");
    expect(html).toContain("davantage de données");
    expect(html).not.toContain("55 900");
    expect(html).not.toContain("2 870");
    expect(html).not.toContain("354 000");
  });
});
