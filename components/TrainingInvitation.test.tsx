import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr" }) }));

import { TrainingInvitation } from "./TrainingInvitation";

describe("TrainingInvitation", () => {
  it("keeps the full ZIP locked during the free trial", () => {
    const html = renderToStaticMarkup(<TrainingInvitation experienceLevel="beginner" subscription={{ status: "trialing", trial_active: true }} />);
    expect(html).toContain("APERÇU DU PACK DE FORMATION");
    expect(html).toContain("Activer mon abonnement");
    expect(html).not.toContain("Télécharger le pack ZIP complet");
  });

  it("offers the complete ZIP only to a paid active subscriber", () => {
    const html = renderToStaticMarkup(<TrainingInvitation experienceLevel="some_experience" subscription={{ status: "active", trial_active: false }} />);
    expect(html).toContain("Télécharger le pack ZIP complet");
  });

  it("does not show training to experienced users", () => {
    expect(renderToStaticMarkup(<TrainingInvitation experienceLevel="experienced" subscription={{ status: "trialing", trial_active: true }} />)).toBe("");
  });
});
