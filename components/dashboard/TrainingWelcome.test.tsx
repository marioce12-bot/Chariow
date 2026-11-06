import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/lib/i18n/i18n", () => ({ useI18n: () => ({ locale: "fr" }) }));
vi.mock("@/app/first-store-welcome.css", () => ({}));
import { shouldShowRecurringTrainingWelcome, TrainingWelcome } from "./TrainingWelcome";

describe("TrainingWelcome", () => {
  it("explains that training is included and remains available after the trial", () => {
    const html = renderToStaticMarkup(<TrainingWelcome subscription={{ status: "trialing", trial_active: true }} onDismiss={vi.fn()} />);
    expect(html).toContain("Apprends tout sur le business des produits digitaux");
    expect(html).toContain("Comprendre le marché des produits digitaux");
    expect(html).toContain("Analyser et optimiser ses performances publicitaires");
    expect(html).toContain("Active ton abonnement pour y accéder");
    expect(html).toContain("après ta période d’essai");
    expect(html).toContain("Activer mon abonnement");
  });

  it("does not show an activation CTA when the paid subscription is active", () => {
    const html = renderToStaticMarkup(<TrainingWelcome subscription={{ status: "active", trial_active: false }} onDismiss={vi.fn()} />);
    expect(html).toContain("Ton abonnement actif inclut déjà le pack complet");
    expect(html).not.toContain("Activer mon abonnement");
  });

  it("reopens on each login for a connected beginner without a paid subscription", () => {
    expect(shouldShowRecurringTrainingWelcome({
      ready: true,
      stage: "welcome",
      experienceLevel: "beginner",
      connectedStore: true,
      subscription: { status: "trialing", trial_active: true },
      dismissed: false,
    })).toBe(true);
  });

  it.each([
    { ready: false, stage: "closed", experienceLevel: "beginner", connectedStore: true, subscription: null, dismissed: false },
    { ready: true, stage: "training", experienceLevel: "beginner", connectedStore: true, subscription: null, dismissed: false },
    { ready: true, stage: "closed", experienceLevel: "some_experience", connectedStore: true, subscription: null, dismissed: false },
    { ready: true, stage: "closed", experienceLevel: "beginner", connectedStore: false, subscription: null, dismissed: false },
    { ready: true, stage: "closed", experienceLevel: "beginner", connectedStore: true, subscription: { status: "active", trial_active: false }, dismissed: false },
    { ready: true, stage: "closed", experienceLevel: "beginner", connectedStore: true, subscription: null, dismissed: true },
  ])("does not reopen when eligibility conditions are not met: %j", (eligibility) => {
    expect(shouldShowRecurringTrainingWelcome(eligibility)).toBe(false);
  });
});
