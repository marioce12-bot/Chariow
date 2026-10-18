import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AutopilotView } from "./AutopilotView";
import { translate } from "@/lib/i18n/translate";

vi.mock("@/lib/i18n/i18n", () => ({
  useI18n: () => ({ locale: "fr", t: (key: string, vars?: Record<string, string | number>) => translate("fr", key, vars) }),
}));

describe("AutopilotView", () => {
  it("announces loading rather than showing an empty report state before data arrives", () => {
    const html = renderToStaticMarkup(<AutopilotView />);
    expect(html).toContain('role="status"');
    expect(html).toContain(translate("fr", "interfaceExtra.reportsLoading"));
    expect(html).not.toContain("autopilot.emptyTitle");
  });

  it("explains insufficient data and avoids suggesting a campaign change", () => {
    const source = require("node:fs").readFileSync(__filename.replace(/\.test\.tsx$/, ".tsx"), "utf8");
    expect(source).toContain('t("interfaceExtra.insufficientExplanation")');
    const explanation = translate("fr", "interfaceExtra.insufficientExplanation");
    expect(explanation).toContain("du suivi des achats, de l’attribution des ventes ou de données trop récentes");
    expect(explanation).toContain("Aucun changement de campagne n’est recommandé");
  });
});
