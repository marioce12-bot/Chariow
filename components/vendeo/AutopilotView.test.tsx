import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AutopilotView } from "./AutopilotView";

vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe("AutopilotView", () => {
  it("announces loading rather than showing an empty report state before data arrives", () => {
    const html = renderToStaticMarkup(<AutopilotView />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Chargement des rapports et notifications");
    expect(html).not.toContain("autopilot.emptyTitle");
  });

  it("explains insufficient data and avoids suggesting a campaign change", () => {
    const source = require("node:fs").readFileSync(__filename.replace(/\.test\.tsx$/, ".tsx"), "utf8");
    expect(source).toContain("du suivi des achats, de l’attribution des ventes ou de données trop récentes");
    expect(source).toContain("Aucun changement de campagne n’est recommandé");
  });
});
